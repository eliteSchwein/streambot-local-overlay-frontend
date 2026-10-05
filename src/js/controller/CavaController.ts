import BaseController from "./BaseController";
import { Websocket } from "websocket-ts";

type CavaBar = HTMLDivElement | SVGRectElement

export default class CavaController extends BaseController {
    websocketEndpoints = ['notify_music_cava']

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

    protected barCountMismatchFrames = 0
    protected pendingBarCount = 0

    async connect() {
        super.connect?.()

        this.isSvgMode = this.element instanceof SVGElement
        this.invertBars = this.element.getAttribute('data-cava-invert-bars') === 'true'
        this.target = this.element.getAttribute('data-cava-target')?.trim() || 'default'
        this.element.classList.add('cava-controller')

        if (this.isSvgMode) {
            this.ensureSvgBars()
        }
    }

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (method !== 'notify_music_cava') return

        const frameTarget = String(data?.target ?? 'default').trim() || 'default'

        if (frameTarget !== this.target) return

        const frames = this.parseCavaFrames(String(data?.raw ?? ''))

        for (const rawValues of frames) {
            if (!rawValues.length) continue

            // Required because the final value is CAVA metadata/control data.
            const values = rawValues.slice(0, -1)

            if (!values.length) continue

            if (!this.expectedBarCount) {
                this.expectedBarCount = values.length
                this.ensureBars(this.expectedBarCount)
            }

            if (values.length !== this.expectedBarCount) {
                console.warn(
                    `[cava] ignoring frame with ${values.length} bars, expected ${this.expectedBarCount}`
                )
                continue
            }

            this.values = values
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
            .map(line => line
                .split(/[;,\s]+/)
                .map(value => Number(value))
                .filter(value => Number.isFinite(value))
                .map(value => Math.max(0, Math.min(100, value)))
            )
            .filter(values => values.length > 0)
    }

    protected ensureBars(count: number) {
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

    protected ensureSvgBars(count?: number) {
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

        const spacingX = Number(spacingReference.getAttribute('x') ?? referenceX + referenceWidth)
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

        this.bars = rects.slice(0, desiredCount)
        this.smoothedValues = new Array(this.bars.length).fill(0)
        this.svgRectData.clear()

        for (const rect of this.bars as SVGRectElement[]) {
            const y = Number(rect.getAttribute('y') ?? referenceY)
            const height = Number(rect.getAttribute('height') ?? referenceHeight)

            this.svgRectData.set(rect, { y, height })
        }
    }

    protected smoothValues() {
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

    protected render() {
        if (this.isSvgMode) {
            this.renderSvgBars()
            return
        }

        this.renderHtmlBars()
    }

    protected renderHtmlBars() {
        for (let i = 0; i < this.bars.length; i++) {
            const bar = this.bars[i] as HTMLDivElement
            const value = this.smoothedValues[i] ?? 0

            bar.style.alignSelf = this.invertBars ? 'flex-start' : 'flex-end'
            bar.style.height = value > 0
                ? `${Math.max(3, value)}%`
                : '0%'
        }
    }

    protected renderSvgBars() {
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