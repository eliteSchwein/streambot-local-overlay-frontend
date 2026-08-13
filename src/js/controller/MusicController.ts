import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

export default class MusicController extends BaseController {
    websocketEndpoints = ['notify_music_update', 'notify_music_show', 'notify_test_mode']

    protected image = {
        trackId: '',
        small: '',
        medium: '',
        data_url: '',
    }

    protected currentTrackId = ''
    protected status: any = {}
    protected track: any = {}

    protected imageElement = this.element.querySelector('[data-music-element="thumbnail"]') as HTMLImageElement | null
    protected barElement = this.element.querySelector('[data-music-element="progress-bar"]') as HTMLElement | SVGLineElement | null
    protected titleElement = this.element.querySelector('[data-music-element="title"]') as HTMLElement | null
    protected artistElement = this.element.querySelector('[data-music-element="artist"]') as HTMLElement | null
    protected volumeBarElement = this.element.querySelector('[data-music-element="volume-bar"]') as HTMLElement | SVGLineElement | null
    protected volumeTextElements = Array.from(this.element.querySelectorAll('[data-music-element="volume-text"]')) as HTMLElement[]
    protected songRequestActiveElements = Array.from(this.element.querySelectorAll('[data-music-element="srActive"]')) as HTMLElement[]
    protected songRequestInactiveElements = Array.from(this.element.querySelectorAll('[data-music-element="srInactive"]')) as HTMLElement[]
    protected playtimeElements = Array.from(this.element.querySelectorAll('[data-music-element="playtime"]')) as HTMLElement[]
    protected remainingTimeElements = Array.from(this.element.querySelectorAll('[data-music-element="remainingtime"]')) as HTMLElement[]

    protected showTimeout: any = -1
    protected testMode = false

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (method === 'notify_music_show') {
            void this.showPlayer()
            return
        }

        if (method === 'notify_test_mode') {
            this.testMode = data.active
            void this.showPlayer()
            return
        }

        if (method !== 'notify_music_update') {
            return
        }

        if (data.thumbnail) {
            this.image = data.thumbnail

            if (this.imageElement && this.image) {
                this.imageElement.src = this.image.data_url
            }
        }

        if (data.status && typeof data.status === 'object') {
            this.status = data.status
        }

        if (data.track) {
            this.track = data.track
        }

        if (!this.track) {
            return
        }

        const volume = Number(this.status.volume ?? data.volume ?? 0)
        const progress = Number(
            this.status.progress_percentage
            ?? data.progress_percentage
            ?? 0
        )
        const playtime = Number(
            this.status.progress
            ?? this.status.position
            ?? data.progress
            ?? data.position
            ?? this.track.progress
            ?? this.track.position
            ?? 0
        )
        const duration = Number(
            this.status.duration
            ?? data.duration
            ?? this.track.duration
            ?? 0
        )
        const remainingTime = Math.max(0, duration - playtime)
        const songRequestActive = data.songrequest?.enabled === true

        this.alertBoxHelper.setTopBarProgress(progress)
        this.updateProgressBar(progress)
        this.updateSongRequestElements(songRequestActive)
        this.updateTextElements(this.playtimeElements, this.formatDuration(playtime))
        this.updateTextElements(this.remainingTimeElements, `-${this.formatDuration(remainingTime)}`)

        if (this.titleElement) {
            this.titleElement.textContent = this.track.title ?? this.track.name ?? ''
        }

        if (this.artistElement) {
            this.artistElement.textContent = this.track.artist ?? this.track.artists?.join(', ') ?? ''
        }

        this.updateVolumeBar(volume)
        this.updateTextElements(this.volumeTextElements, `${volume.toFixed(0)}%`)

        this.currentTrackId = this.track.id
    }


    protected updateProgressBar(progress: number) {
        if (!this.barElement) return

        this.updateBarElement(this.barElement, progress)
    }

    protected updateVolumeBar(volume: number) {
        if (!this.volumeBarElement) return

        this.updateBarElement(this.volumeBarElement, volume)
    }

    protected updateBarElement(element: HTMLElement | SVGLineElement, value: number) {
        const safeValue = Number.isFinite(value)
            ? Math.max(0, Math.min(100, value))
            : 0
        const factor = safeValue / 100

        if (element instanceof SVGLineElement) {
            const maxX = this.parseOptionalNumber(element.getAttribute('data-music-max-x'))
            const maxY = this.parseOptionalNumber(element.getAttribute('data-music-max-y'))

            if (maxX !== null) {
                const startX = this.parseOptionalNumber(element.getAttribute('x1')) ?? 0
                const nextX = startX + ((maxX - startX) * factor)

                element.setAttribute('x2', String(nextX))
            }

            if (maxY !== null) {
                const startY = this.parseOptionalNumber(element.getAttribute('y1')) ?? 0
                const nextY = startY + ((maxY - startY) * factor)

                element.setAttribute('y2', String(nextY))
            }

            return
        }

        element.style.width = `${safeValue}%`
    }

    protected parseOptionalNumber(value: string | null): number | null {
        if (value === null || value.trim() === '') return null

        const parsed = Number(value)

        return Number.isFinite(parsed) ? parsed : null
    }

    protected updateSongRequestElements(active: boolean) {
        for (const element of this.songRequestActiveElements) {
            element.style.display = active ? '' : 'none'
        }

        for (const element of this.songRequestInactiveElements) {
            element.style.display = active ? 'none' : ''
        }
    }

    protected updateTextElements(elements: HTMLElement[], value: string) {
        for (const element of elements) {
            element.textContent = value
        }
    }

    protected formatDuration(value: number): string {
        const totalSeconds = Math.max(0, Math.floor(value / 1000))
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        if (hours > 0) {
            return [hours, minutes, seconds]
                .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
                .join(':')
        }

        return `${minutes}:${String(seconds).padStart(2, '0')}`
    }

    protected updateBarTheme(element: HTMLElement | SVGLineElement | null, color: string) {
        if (element instanceof SVGLineElement) {
            element.setAttribute('stroke', color)
            return
        }

        if (element) {
            element.style.background = color
        }
    }

    async handleGameUpdate(websocket: Websocket, data: any) {
        if (this.element.hasAttribute("data-disable-theme")) return

        this.updateBarTheme(this.barElement, data.theme.color)
        this.updateBarTheme(this.volumeBarElement, data.theme.color)

        if (this.titleElement) {
            this.titleElement.style.color = data.theme.color
        }
    }

    showPlayer() {
        this.alertBoxHelper.show()
        clearTimeout(this.showTimeout)

        this.showTimeout = setTimeout(() => {
            if (this.testMode) return
            this.alertBoxHelper.hide()
        }, 15_000)
    }
}
