import BaseController from "./BaseController";
import { getConfig } from "../helper/ConfigHelper";

type CavaBar = HTMLDivElement | SVGRectElement

type CavaSubscriber = {
    onMessage: (raw: unknown) => void
    onReset: () => void
}

type SharedCavaConnection = {
    target: string
    subscribers: Set<CavaSubscriber>
    websocket?: globalThis.WebSocket
    reconnectTimer?: number
}

const sharedCavaConnections = new Map<string, SharedCavaConnection>()

function getCavaUrl(target: string): string {
    const config = getConfig(/websocket/g)[0]
    const port = config?.port ?? 8100

    return `ws://${window.location.hostname}:${port}/cava/${encodeURIComponent(target)}`
}

function openSharedCavaConnection(connection: SharedCavaConnection): void {
    if (connection.subscribers.size < 1) return

    if (
        connection.websocket &&
        (
            connection.websocket.readyState === globalThis.WebSocket.OPEN ||
            connection.websocket.readyState === globalThis.WebSocket.CONNECTING
        )
    ) {
        return
    }

    console.log(`connect cava websocket ${connection.target}`)

    const websocket = new globalThis.WebSocket(getCavaUrl(connection.target))
    connection.websocket = websocket

    websocket.onopen = () => {
        if (connection.websocket !== websocket) return

        if (connection.reconnectTimer !== undefined) {
            window.clearTimeout(connection.reconnectTimer)
            connection.reconnectTimer = undefined
        }
    }

    websocket.onmessage = event => {
        if (connection.websocket !== websocket) return

        for (const subscriber of connection.subscribers) {
            try {
                subscriber.onMessage(event.data)
            } catch (error) {
                console.warn(
                    `[cava] failed processing frame for ${connection.target}`,
                    error
                )
            }
        }
    }

    websocket.onerror = () => {
        // Reconnect is handled by onclose.
    }

    websocket.onclose = () => {
        if (connection.websocket !== websocket) return

        connection.websocket = undefined

        for (const subscriber of connection.subscribers) {
            try {
                subscriber.onReset()
            } catch {
                // Ignore reset errors from individual subscribers.
            }
        }

        if (connection.subscribers.size < 1) {
            sharedCavaConnections.delete(connection.target)
            return
        }

        scheduleSharedCavaReconnect(connection)
    }
}

function scheduleSharedCavaReconnect(connection: SharedCavaConnection): void {
    if (
        connection.subscribers.size < 1 ||
        connection.reconnectTimer !== undefined
    ) {
        return
    }

    // Same simple reconnect behaviour used by the Commander CAVA connection.
    connection.reconnectTimer = window.setTimeout(() => {
        connection.reconnectTimer = undefined
        openSharedCavaConnection(connection)
    }, 2_000)
}

function subscribeToCava(
    target: string,
    subscriber: CavaSubscriber
): () => void {
    let connection = sharedCavaConnections.get(target)

    if (!connection) {
        connection = {
            target,
            subscribers: new Set<CavaSubscriber>(),
        }

        sharedCavaConnections.set(target, connection)
    }

    connection.subscribers.add(subscriber)
    openSharedCavaConnection(connection)

    return () => {
        const current = sharedCavaConnections.get(target)
        if (!current) return

        current.subscribers.delete(subscriber)

        if (current.subscribers.size > 0) return

        if (current.reconnectTimer !== undefined) {
            window.clearTimeout(current.reconnectTimer)
            current.reconnectTimer = undefined
        }

        const websocket = current.websocket
        current.websocket = undefined

        if (websocket) {
            websocket.onopen = null
            websocket.onmessage = null
            websocket.onerror = null
            websocket.onclose = null

            try {
                websocket.close()
            } catch {
                // Already closed.
            }
        }

        sharedCavaConnections.delete(target)
    }
}

export default class CavaController extends BaseController {
    // CAVA is transported through its own /cava/<target> websocket. Keep the
    // BaseController lifecycle, but do not register CAVA on the normal socket.
    websocketEndpoints: string[] = []

    protected bars: CavaBar[] = []
    protected values: number[] = []
    protected smoothedValues: number[] = []

    protected cavaBuffer = ''
    protected expectedBarCount = 0
    protected target = 'default'

    protected smoothing = 0.45
    protected falloff = 6

    protected isSvgMode = false
    protected invertBars = false
    protected svgRectData = new Map<SVGRectElement, { y: number, height: number }>()

    protected unsubscribeCava?: () => void

    async preConnect(): Promise<void> {
        this.isSvgMode = this.element instanceof SVGElement
        this.invertBars = this.element.getAttribute('data-cava-invert-bars') === 'true'
        this.target = this.element.getAttribute('data-cava-target')?.trim() || 'default'
        this.element.classList.add('cava-controller')

        // Capture the original SVG geometry before CAVA ever modifies it.
        if (this.isSvgMode) {
            this.ensureSvgBars()
        }
    }

    async postConnect(): Promise<void> {
        this.unsubscribeCava?.()

        const subscriber: CavaSubscriber = {
            onMessage: raw => this.handleCavaMessage(raw),
            onReset: () => this.resetCava(),
        }

        this.unsubscribeCava = subscribeToCava(this.target, subscriber)
    }

    disconnect(): void {
        this.unsubscribeCava?.()
        this.unsubscribeCava = undefined
        this.resetCava()
    }

    protected handleCavaMessage(raw: unknown): void {
        if (typeof raw !== 'string') return

        let message: any

        try {
            message = JSON.parse(raw)
        } catch {
            return
        }

        if (message?.method !== 'notify_music_cava') return

        const data = message?.params ?? {}
        const frameTarget = String(data?.target ?? this.target).trim() || this.target

        if (frameTarget !== this.target) return

        this.handleCavaData(String(data?.raw ?? ''))
    }

    /**
     * Mirrors the Commander CAVA path:
     *  - keep a newline buffer because a CAVA stdout chunk may contain partial
     *    and/or multiple frames;
     *  - remove the trailing CAVA control value in the parser;
     *  - establish the visualizer bar count once;
     *  - normalize later frames to that fixed count instead of rebuilding bars;
     *  - smooth and render directly, without rAF/timer throttling.
     */
    protected handleCavaData(raw: string): void {
        const frames = this.parseCavaFrames(raw)

        for (const values of frames) {
            if (!values.length) continue

            if (!this.expectedBarCount) {
                this.expectedBarCount = values.length
                this.ensureBars(this.expectedBarCount)
            }

            const normalizedValues = values.slice(0, this.expectedBarCount)

            while (normalizedValues.length < this.expectedBarCount) {
                normalizedValues.push(0)
            }

            this.values = normalizedValues
            this.smoothValues()
            this.render()
        }
    }

    protected parseCavaFrames(raw: string): number[][] {
        if (!raw) return []

        this.cavaBuffer += raw

        const lines = this.cavaBuffer.split(/\r?\n/)
        this.cavaBuffer = lines.pop() ?? ''

        return lines
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const values = line
                    .split(/[;,\s]+/)
                    .map(value => Number(value))
                    .filter(value => Number.isFinite(value))
                    .map(value => Math.max(0, Math.min(100, value)))

                // Current CAVA ascii output contains one trailing control value.
                return values.length > 1
                    ? values.slice(0, -1)
                    : values
            })
            .filter(values => values.length > 0)
    }

    protected resetCava(): void {
        this.cavaBuffer = ''
        this.values = new Array(this.expectedBarCount).fill(0)
        this.smoothedValues = new Array(this.expectedBarCount).fill(0)

        if (this.expectedBarCount > 0) {
            this.render()
        }
    }

    protected ensureBars(count: number): void {
        if (this.isSvgMode) {
            this.ensureSvgBars(count)
            return
        }

        if (this.bars.length === count) return

        this.element.innerHTML = ''
        this.bars = []
        this.smoothedValues = new Array(count).fill(0)

        for (let i = 0; i < count; i++) {
            const bar = document.createElement('div')
            bar.classList.add('cava-bar')
            bar.style.alignSelf = this.invertBars ? 'flex-start' : 'flex-end'
            this.element.appendChild(bar)
            this.bars.push(bar)
        }
    }

    protected ensureSvgBars(count?: number): void {
        const rects = Array.from(
            this.element.querySelectorAll(':scope > rect')
        ) as SVGRectElement[]

        if (rects.length < 1) return

        const reference = rects[0]
        const spacingReference = rects[1] ?? rects[0]

        const referenceX = Number(reference.getAttribute('x') ?? 0)
        const referenceY = Number(reference.getAttribute('y') ?? 0)
        const referenceWidth = Number(reference.getAttribute('width') ?? 0)
        const referenceHeight = Number(reference.getAttribute('height') ?? 0)

        const spacingX = Number(
            spacingReference.getAttribute('x') ?? referenceX + referenceWidth
        )

        const stepX = rects[1]
            ? spacingX - referenceX
            : referenceWidth + 1

        const safeStepX = Number.isFinite(stepX) && stepX !== 0
            ? stepX
            : referenceWidth + 1

        const desiredCount = count ?? rects.length

        while (rects.length < desiredCount) {
            const index = rects.length
            const clone = reference.cloneNode(true) as SVGRectElement

            clone.setAttribute('x', String(referenceX + safeStepX * index))
            clone.setAttribute('y', String(referenceY))
            clone.setAttribute('width', String(referenceWidth))
            clone.setAttribute('height', String(referenceHeight))

            this.element.appendChild(clone)
            rects.push(clone)
        }

        // If the markup contains more seed bars than the configured CAVA frame,
        // only use the requested amount. Do not rebuild them again on later frames.
        this.bars = rects.slice(0, desiredCount)
        this.smoothedValues = new Array(this.bars.length).fill(0)
        this.svgRectData.clear()

        for (const rect of this.bars as SVGRectElement[]) {
            const y = Number(rect.getAttribute('y') ?? referenceY)
            const height = Number(rect.getAttribute('height') ?? referenceHeight)

            this.svgRectData.set(rect, { y, height })
        }
    }

    protected smoothValues(): void {
        for (let i = 0; i < this.values.length; i++) {
            const target = this.values[i] ?? 0
            const current = this.smoothedValues[i] ?? 0

            if (target > current) {
                this.smoothedValues[i] =
                    current + (target - current) * this.smoothing
            } else {
                this.smoothedValues[i] =
                    Math.max(target, current - this.falloff)
            }
        }
    }

    protected render(): void {
        if (this.isSvgMode) {
            this.renderSvgBars()
            return
        }

        this.renderHtmlBars()
    }

    protected renderHtmlBars(): void {
        for (let i = 0; i < this.bars.length; i++) {
            const bar = this.bars[i] as HTMLDivElement
            const value = this.smoothedValues[i] ?? 0

            bar.style.alignSelf = this.invertBars ? 'flex-start' : 'flex-end'
            bar.style.height = value > 0
                ? `${Math.max(3, value)}%`
                : '0%'
        }
    }

    protected renderSvgBars(): void {
        for (let i = 0; i < this.bars.length; i++) {
            const rect = this.bars[i] as SVGRectElement
            const original = this.svgRectData.get(rect)

            if (!original) continue

            const value = this.smoothedValues[i] ?? 0
            const height = value > 0
                ? Math.max(1, original.height * (value / 100))
                : 0

            const y = this.invertBars
                ? original.y
                : original.y + original.height - height

            rect.setAttribute('height', String(height))
            rect.setAttribute('y', String(y))
        }
    }
}
