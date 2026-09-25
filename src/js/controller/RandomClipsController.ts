import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

type ClipPayload = {
    id: string
    title?: string
    media_url?: string
    duration?: number
    broadcaster_name?: string
    creator_name?: string
    thumbnail_url?: string
    views?: number
}

type RandomClipMessage = {
    action: 'play' | 'disable'

    clip?: ClipPayload

    channel?: string
    name?: string

    volume?: number
    info?: boolean
    show_timer?: boolean

    playback_seconds?: number
}

export default class RandomClipsController extends BaseController {
    websocketEndpoints = [
        'notify_random_clips',
    ]

    protected video?: HTMLVideoElement
    protected infoElement?: HTMLDivElement
    protected timerElement?: HTMLDivElement

    protected timerInterval?: number
    protected hideTimeout?: number

    async preConnect() {
        this.element.classList.add(
            'random-clips-controller'
        )

        this.video =
            document.createElement('video')

        this.video.autoplay = true
        this.video.playsInline = true
        this.video.controls = false

        this.video.style.width = '100%'
        this.video.style.height = '100%'
        this.video.style.objectFit = 'contain'
        this.video.style.display = 'none'

        this.element.appendChild(
            this.video
        )

        this.infoElement =
            document.createElement('div')

        this.infoElement.classList.add(
            'random-clips-info'
        )

        this.infoElement.style.display =
            'none'

        this.element.appendChild(
            this.infoElement
        )

        this.timerElement =
            document.createElement('div')

        this.timerElement.classList.add(
            'random-clips-timer'
        )

        this.timerElement.style.display =
            'none'

        this.element.appendChild(
            this.timerElement
        )
    }

    async handleMessage(
        websocket: Websocket,
        method: string,
        data: RandomClipMessage
    ) {
        if (
            method !==
            'notify_random_clips'
        ) {
            return
        }

        if (
            data?.action === 'disable'
        ) {
            this.stop()
            return
        }

        if (
            data?.action !== 'play' ||
            !data?.clip?.media_url
        ) {
            return
        }

        await this.play(data)
    }

    disconnect() {
        this.stop()

        this.video?.remove()
        this.video = undefined

        this.infoElement?.remove()
        this.infoElement = undefined

        this.timerElement?.remove()
        this.timerElement = undefined
    }

    protected async play(
        data: RandomClipMessage
    ) {
        if (
            !this.video ||
            !data.clip?.media_url
        ) {
            return
        }

        this.clearTimers()

        const clip = data.clip

        const volume =
            Math.max(
                0,
                Math.min(
                    100,
                    Number(
                        data.volume ?? 50
                    )
                )
            )

        this.video.pause()

        this.video.volume =
            volume / 100

        this.video.muted = false

        this.video.src =
            clip.media_url

        this.video.currentTime = 0
        this.video.style.display = ''

        this.updateInfo(
            clip,
            data
        )

        try {
            await this.video.play()
        } catch (error) {
            console.warn(
                '[random-clips] playback failed',
                error
            )

            this.stop()
            return
        }

        const playbackSeconds =
            Math.max(
                0,
                Number(
                    data.playback_seconds ??
                    clip.duration ??
                    0
                )
            )

        if (
            data.show_timer === true &&
            playbackSeconds > 0
        ) {
            this.startTimer(
                playbackSeconds
            )
        }

        if (playbackSeconds > 0) {
            this.hideTimeout =
                window.setTimeout(
                    () => {
                        this.hidePlayer()
                    },
                    Math.ceil(
                        playbackSeconds *
                        1000
                    )
                )
        }
    }

    protected updateInfo(
        clip: ClipPayload,
        data: RandomClipMessage
    ) {
        if (!this.infoElement) {
            return
        }

        if (data.info !== true) {
            this.infoElement.style.display =
                'none'

            return
        }

        const broadcaster =
            clip.broadcaster_name ??
            data.name ??
            data.channel ??
            ''

        const title =
            clip.title ?? ''

        this.infoElement.textContent =
            broadcaster && title
                ? `${broadcaster} · ${title}`
                : broadcaster || title

        this.infoElement.style.display =
            ''
    }

    protected startTimer(
        duration: number
    ) {
        if (!this.timerElement) {
            return
        }

        const startedAt =
            performance.now()

        this.timerElement.style.display =
            ''

        const update = () => {
            if (!this.timerElement) {
                return
            }

            const elapsed =
                (
                    performance.now() -
                    startedAt
                ) / 1000

            const remaining =
                Math.max(
                    0,
                    duration - elapsed
                )

            this.timerElement.textContent =
                this.formatTime(
                    remaining
                )

            if (
                remaining <= 0 &&
                this.timerInterval !== undefined
            ) {
                window.clearInterval(
                    this.timerInterval
                )

                this.timerInterval =
                    undefined
            }
        }

        update()

        this.timerInterval =
            window.setInterval(
                update,
                250
            )
    }

    protected stop() {
        this.clearTimers()
        this.hidePlayer()

        if (this.infoElement) {
            this.infoElement.style.display =
                'none'

            this.infoElement.textContent =
                ''
        }

        if (this.timerElement) {
            this.timerElement.style.display =
                'none'

            this.timerElement.textContent =
                ''
        }
    }

    protected hidePlayer() {
        if (!this.video) {
            return
        }

        this.video.pause()

        this.video.removeAttribute(
            'src'
        )

        this.video.load()

        this.video.style.display =
            'none'
    }

    protected clearTimers() {
        if (
            this.timerInterval !==
            undefined
        ) {
            window.clearInterval(
                this.timerInterval
            )

            this.timerInterval =
                undefined
        }

        if (
            this.hideTimeout !==
            undefined
        ) {
            window.clearTimeout(
                this.hideTimeout
            )

            this.hideTimeout =
                undefined
        }
    }

    protected formatTime(
        seconds: number
    ) {
        const value =
            Math.ceil(seconds)

        return `${Math.floor(value / 60)}:${String(
            value % 60
        ).padStart(2, '0')}`
    }
}