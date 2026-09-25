import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

type AudioStreamPacket = {
    cable?: string
    id?: string

    data?: string
    audio?: string
    pcm?: string

    sample_rate?: number
    sampleRate?: number
    rate?: number

    channels?: number

    format?: string
}

export default class AudioController extends BaseController {
    websocketEndpoints = [
        'notify_audio_stream',
    ]

    protected cableId?: string

    protected audioContext?: AudioContext
    protected workletNode?: AudioWorkletNode

    protected workletLoaded = false
    protected initialized = false

    protected sampleRate = 48000
    protected channels = 2
    protected format = 's16le'

    protected pendingPackets: Array<{
        pcm: ArrayBuffer
        sampleRate: number
        channels: number
        format: string
    }> = []

    async preConnect() {
        this.cableId =
            this.element
                .getAttribute('data-audio-cable')
                ?.trim() || undefined
    }

    async postConnect() {
        if (!this.cableId) {
            return
        }

        await this.initAudio()
    }

    async handleMessage(
        websocket: Websocket,
        method: string,
        data: AudioStreamPacket
    ) {
        if (method !== 'notify_audio_stream') {
            return
        }

        if (!this.cableId) {
            return
        }

        const cable =
            String(
                data?.cable ??
                data?.id ??
                ''
            ).trim()

        if (cable !== this.cableId) {
            return
        }

        const pcm =
            this.decodeAudioPayload(data)

        if (!pcm) {
            return
        }

        const sampleRate = Number(
            data?.sample_rate ??
            data?.sampleRate ??
            data?.rate ??
            48000
        )

        const channels = Number(
            data?.channels ?? 2
        )

        const format =
            String(
                data?.format ??
                's16le'
            ).toLowerCase()

        await this.pushAudio(
            pcm,
            Number.isFinite(sampleRate)
                ? sampleRate
                : 48000,
            Number.isFinite(channels)
                ? channels
                : 2,
            format
        )
    }

    disconnect() {
        this.pendingPackets = []

        if (this.workletNode) {
            try {
                this.workletNode.port.postMessage({
                    type: 'reset',
                })

                this.workletNode.disconnect()
            } catch {
                // Already disconnected.
            }

            this.workletNode = undefined
        }

        if (this.audioContext) {
            void this.audioContext.close()
            this.audioContext = undefined
        }

        this.initialized = false
        this.workletLoaded = false
    }

    protected async initAudio() {
        if (this.initialized) {
            return
        }

        this.initialized = true

        try {
            this.audioContext =
                new AudioContext({
                    latencyHint: 'interactive',
                    sampleRate: 48000,
                })

            await this.loadWorklet()

            this.workletNode =
                new AudioWorkletNode(
                    this.audioContext,
                    'streambot-audio-player',
                    {
                        numberOfInputs: 0,
                        numberOfOutputs: 1,

                        outputChannelCount: [
                            2
                        ],
                    }
                )

            this.workletNode.connect(
                this.audioContext.destination
            )

            await this.resumeAudio()

            this.flushPendingPackets()
        } catch (error) {
            this.initialized = false

            console.warn(
                '[audio] failed to initialize audio playback',
                error
            )
        }
    }

    protected async loadWorklet() {
        if (
            !this.audioContext ||
            this.workletLoaded
        ) {
            return
        }

        const source = `
class StreambotAudioPlayerProcessor extends AudioWorkletProcessor {
    constructor() {
        super()

        this.left = []
        this.right = []

        this.readOffset = 0

        this.started = false

        /*
         * Roughly 60 ms startup buffer.
         *
         * Enough to smooth websocket jitter without creating
         * noticeable overlay latency.
         */
        this.startThreshold = Math.max(
            128,
            Math.round(sampleRate * 0.06)
        )

        /*
         * Do not allow latency to grow forever.
         * Around 250 ms is already more than enough.
         */
        this.maxBufferedFrames = Math.round(
            sampleRate * 0.25
        )

        this.port.onmessage = event => {
            const message = event.data

            if (!message) {
                return
            }

            if (message.type === 'reset') {
                this.reset()
                return
            }

            if (message.type !== 'audio') {
                return
            }

            this.push(
                message.left,
                message.right
            )
        }
    }

    reset() {
        this.left = []
        this.right = []
        this.readOffset = 0
        this.started = false
    }

    bufferedFrames() {
        let length = -this.readOffset

        for (const chunk of this.left) {
            length += chunk.length
        }

        return Math.max(0, length)
    }

    push(left, right) {
        if (!(left instanceof Float32Array)) {
            return
        }

        if (!(right instanceof Float32Array)) {
            right = left
        }

        this.left.push(left)
        this.right.push(right)

        /*
         * If the browser was throttled or websocket delivery
         * stalled, throw away old audio instead of playing it
         * several hundred ms late.
         */
        while (
            this.bufferedFrames() >
            this.maxBufferedFrames &&
            this.left.length > 1
        ) {
            this.left.shift()
            this.right.shift()

            this.readOffset = 0
        }
    }

    readSample(channel) {
        const queue =
            channel === 0
                ? this.left
                : this.right

        if (!queue.length) {
            return 0
        }

        let chunk = queue[0]

        if (this.readOffset >= chunk.length) {
            this.left.shift()
            this.right.shift()

            this.readOffset = 0

            if (!queue.length) {
                return 0
            }

            chunk = queue[0]
        }

        return chunk[this.readOffset] || 0
    }

    process(inputs, outputs) {
        const output = outputs[0]

        if (!output || output.length === 0) {
            return true
        }

        const leftOutput = output[0]
        const rightOutput =
            output[1] ?? output[0]

        if (!this.started) {
            if (
                this.bufferedFrames() <
                this.startThreshold
            ) {
                leftOutput.fill(0)
                rightOutput.fill(0)

                return true
            }

            this.started = true
        }

        for (
            let frame = 0;
            frame < leftOutput.length;
            frame++
        ) {
            if (!this.left.length) {
                /*
                 * Underrun.
                 *
                 * Go silent and wait for the jitter buffer to
                 * refill instead of constantly stuttering.
                 */
                this.started = false

                for (
                    let remaining = frame;
                    remaining < leftOutput.length;
                    remaining++
                ) {
                    leftOutput[remaining] = 0
                    rightOutput[remaining] = 0
                }

                break
            }

            leftOutput[frame] =
                this.readSample(0)

            rightOutput[frame] =
                this.readSample(1)

            this.readOffset++
        }

        return true
    }
}

registerProcessor(
    'streambot-audio-player',
    StreambotAudioPlayerProcessor
)
`

        const blob =
            new Blob(
                [source],
                {
                    type: 'application/javascript',
                }
            )

        const url =
            URL.createObjectURL(blob)

        try {
            await this.audioContext
                .audioWorklet
                .addModule(url)

            this.workletLoaded = true
        } finally {
            URL.revokeObjectURL(url)
        }
    }

    protected async pushAudio(
        pcm: ArrayBuffer,
        sampleRate: number,
        channels: number,
        format: string
    ) {
        if (!this.initialized) {
            await this.initAudio()
        }

        if (!this.workletNode) {
            this.pendingPackets.push({
                pcm,
                sampleRate,
                channels,
                format,
            })

            if (
                this.pendingPackets.length > 25
            ) {
                this.pendingPackets.shift()
            }

            return
        }

        await this.resumeAudio()

        const converted =
            this.convertToFloat32(
                pcm,
                channels,
                format
            )

        if (!converted) {
            return
        }

        const resampled =
            this.resampleIfNeeded(
                converted.left,
                converted.right,
                sampleRate
            )

        this.workletNode.port.postMessage(
            {
                type: 'audio',
                left: resampled.left,
                right: resampled.right,
            },
            [
                resampled.left.buffer,
                resampled.right.buffer,
            ]
        )
    }

    protected convertToFloat32(
        buffer: ArrayBuffer,
        channels: number,
        format: string
    ): {
        left: Float32Array
        right: Float32Array
    } | null {
        channels =
            Math.max(
                1,
                Math.min(2, channels)
            )

        if (
            format === 'f32le' ||
            format === 'float32le' ||
            format === 'float32'
        ) {
            const input =
                new Float32Array(buffer)

            const frames =
                Math.floor(
                    input.length /
                    channels
                )

            const left =
                new Float32Array(frames)

            const right =
                new Float32Array(frames)

            for (
                let frame = 0;
                frame < frames;
                frame++
            ) {
                const base =
                    frame * channels

                left[frame] =
                    input[base] ?? 0

                right[frame] =
                    channels > 1
                        ? input[base + 1] ?? 0
                        : left[frame]
            }

            return {
                left,
                right,
            }
        }

        if (
            format === 's16le' ||
            format === 'pcm_s16le' ||
            format === 'int16'
        ) {
            const input =
                new DataView(buffer)

            const bytesPerFrame =
                channels * 2

            const frames =
                Math.floor(
                    buffer.byteLength /
                    bytesPerFrame
                )

            const left =
                new Float32Array(frames)

            const right =
                new Float32Array(frames)

            for (
                let frame = 0;
                frame < frames;
                frame++
            ) {
                const offset =
                    frame *
                    bytesPerFrame

                left[frame] =
                    input.getInt16(
                        offset,
                        true
                    ) / 32768

                right[frame] =
                    channels > 1
                        ? input.getInt16(
                        offset + 2,
                        true
                    ) / 32768
                        : left[frame]
            }

            return {
                left,
                right,
            }
        }

        console.warn(
            `[audio] unsupported PCM format "${format}"`
        )

        return null
    }

    protected resampleIfNeeded(
        left: Float32Array,
        right: Float32Array,
        sourceRate: number
    ) {
        const destinationRate =
            this.audioContext?.sampleRate ??
            48000

        if (
            sourceRate === destinationRate ||
            !sourceRate ||
            left.length === 0
        ) {
            return {
                left,
                right,
            }
        }

        const ratio =
            sourceRate /
            destinationRate

        const outputLength =
            Math.max(
                1,
                Math.round(
                    left.length / ratio
                )
            )

        const outputLeft =
            new Float32Array(
                outputLength
            )

        const outputRight =
            new Float32Array(
                outputLength
            )

        for (
            let i = 0;
            i < outputLength;
            i++
        ) {
            const sourcePosition =
                i * ratio

            const index =
                Math.floor(
                    sourcePosition
                )

            const fraction =
                sourcePosition -
                index

            const nextIndex =
                Math.min(
                    index + 1,
                    left.length - 1
                )

            outputLeft[i] =
                (left[index] ?? 0) *
                (1 - fraction) +
                (left[nextIndex] ?? 0) *
                fraction

            outputRight[i] =
                (right[index] ?? 0) *
                (1 - fraction) +
                (right[nextIndex] ?? 0) *
                fraction
        }

        return {
            left: outputLeft,
            right: outputRight,
        }
    }

    protected decodeAudioPayload(
        data: AudioStreamPacket
    ): ArrayBuffer | null {
        const encoded =
            data?.data ??
            data?.audio ??
            data?.pcm

        if (
            typeof encoded !== 'string' ||
            !encoded
        ) {
            return null
        }

        try {
            const binary =
                atob(encoded)

            const result =
                new Uint8Array(
                    binary.length
                )

            for (
                let i = 0;
                i < binary.length;
                i++
            ) {
                result[i] =
                    binary.charCodeAt(i)
            }

            return result.buffer
        } catch (error) {
            console.warn(
                '[audio] invalid audio stream payload',
                error
            )

            return null
        }
    }

    protected flushPendingPackets() {
        const packets =
            this.pendingPackets

        this.pendingPackets = []

        for (const packet of packets) {
            void this.pushAudio(
                packet.pcm,
                packet.sampleRate,
                packet.channels,
                packet.format
            )
        }
    }

    protected async resumeAudio() {
        if (
            !this.audioContext ||
            this.audioContext.state !==
            'suspended'
        ) {
            return
        }

        try {
            await this.audioContext.resume()
        } catch (error) {
            console.warn(
                '[audio] failed to resume AudioContext',
                error
            )
        }
    }
}