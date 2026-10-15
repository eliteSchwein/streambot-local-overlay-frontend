import BaseController from "./BaseController";
import { Websocket } from "websocket-ts";

type MediaElement = HTMLImageElement | HTMLVideoElement | HTMLAudioElement | HTMLIFrameElement

type MediaType = 'image' | 'video' | 'audio' | 'iframe' | 'unknown'

type OriginalMediaState = {
    className: string
    innerHTML?: string
    attributes?: Array<[string, string]>
}

export default class MediaController extends BaseController {
    websocketEndpoints = ['notify_media_update']

    protected target = 'default'
    protected mediaElement?: MediaElement
    protected clearOnEmpty = true
    protected autoplay = true
    protected loop = false
    protected muted = false
    protected controls = false
    protected originalState?: OriginalMediaState

    async connect() {
        super.connect?.()

        this.target = this.element.getAttribute('data-media-target')?.trim() || 'default'
        this.clearOnEmpty = this.element.getAttribute('data-media-clear-on-empty') !== 'false'
        this.autoplay = this.element.getAttribute('data-media-autoplay') !== 'false'
        this.loop = this.element.getAttribute('data-media-loop') === 'true'
        this.muted = this.element.getAttribute('data-media-muted') === 'true'
        this.controls = this.element.getAttribute('data-media-controls') === 'true'

        this.element.classList.add('media-controller')
        this.captureOriginalState()
        this.findMediaElement()
    }

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (method !== 'notify_media_update') return

        const frameTarget = String(data?.target ?? 'default').trim() || 'default'

        if (frameTarget !== this.target) return

        if (data?.media === 'clear_media') {
            this.restoreOriginalState()
            return
        }

        const path = String(data?.path ?? data?.src ?? '').trim()

        if (!path) {
            if (this.clearOnEmpty) this.restoreOriginalState()
            return
        }

        this.showMedia(path, data)
    }

    protected captureOriginalState() {
        if (this.isMediaElement(this.element)) {
            this.originalState = {
                className: this.element.className,
                attributes: Array.from(this.element.attributes)
                    .map(attribute => [attribute.name, attribute.value]),
            }
            return
        }

        this.originalState = {
            className: this.element.className,
            innerHTML: this.element.innerHTML,
        }
    }

    protected restoreOriginalState() {
        if (!this.originalState) return

        this.stopCurrentMedia()

        if (this.isMediaElement(this.element)) {
            for (const attribute of Array.from(this.element.attributes)) {
                this.element.removeAttribute(attribute.name)
            }

            for (const [name, value] of this.originalState.attributes ?? []) {
                this.element.setAttribute(name, value)
            }

            this.element.className = this.originalState.className
            this.mediaElement = this.element
            this.reloadRestoredMedia(this.mediaElement)
            return
        }

        this.element.innerHTML = this.originalState.innerHTML ?? ''
        this.element.className = this.originalState.className
        this.findMediaElement()

        if (this.mediaElement) {
            this.reloadRestoredMedia(this.mediaElement)
        }
    }

    protected stopCurrentMedia() {
        if (this.mediaElement instanceof HTMLVideoElement || this.mediaElement instanceof HTMLAudioElement) {
            this.mediaElement.pause()
        }
    }

    protected reloadRestoredMedia(element: MediaElement) {
        if (!(element instanceof HTMLVideoElement) && !(element instanceof HTMLAudioElement)) return

        element.load()

        if (element.autoplay && element.hasAttribute('src')) {
            element.play().catch(() => undefined)
        }
    }

    protected findMediaElement() {
        this.mediaElement = undefined

        if (this.isMediaElement(this.element)) {
            this.mediaElement = this.element
            return
        }

        const child = this.element.querySelector('img, video, audio, iframe')

        if (child && this.isMediaElement(child)) {
            this.mediaElement = child
        }
    }

    protected showMedia(src: string, data: any = {}) {
        const type = this.detectMediaType(src, data.type)
        const element = this.ensureMediaElement(type)

        if (!element) return

        this.element.classList.remove('media-empty')
        this.element.classList.add('media-active', `media-${type}`)

        for (const className of Array.from(this.element.classList)) {
            if (className.startsWith('media-') && !['media-controller', 'media-active'].includes(className)) {
                this.element.classList.remove(className)
            }
        }

        this.element.classList.add(`media-${type}`)

        element.setAttribute('src', src)

        if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) {
            element.autoplay = data.autoplay ?? this.autoplay
            element.loop = data.loop ?? this.loop
            element.muted = data.muted ?? this.muted
            element.controls = data.controls ?? this.controls
            element.load()

            if (element.autoplay) {
                element.play().catch(() => undefined)
            }
        }
    }

    protected ensureMediaElement(type: MediaType): MediaElement | undefined {
        if (this.mediaElement && this.matchesType(this.mediaElement, type)) {
            return this.mediaElement
        }

        if (this.isMediaElement(this.element) && this.matchesType(this.element, type)) {
            this.mediaElement = this.element
            return this.mediaElement
        }

        if (this.isMediaElement(this.element)) {
            return undefined
        }

        this.element.innerHTML = ''
        this.mediaElement = this.createMediaElement(type)

        if (!this.mediaElement) return undefined

        this.element.appendChild(this.mediaElement)

        return this.mediaElement
    }

    protected createMediaElement(type: MediaType): MediaElement | undefined {
        switch (type) {
            case 'image':
                return document.createElement('img')

            case 'video':
                return document.createElement('video')

            case 'audio':
                return document.createElement('audio')

            case 'iframe':
                return document.createElement('iframe')

            default:
                return document.createElement('img')
        }
    }

    protected detectMediaType(src: string, preferredType?: string): MediaType {
        const type = String(preferredType ?? '').toLowerCase()

        if (['image', 'video', 'audio', 'iframe'].includes(type)) {
            return type as MediaType
        }

        if (/\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(src)) return 'image'
        if (/\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(src)) return 'video'
        if (/\.(mp3|wav|opus|oga|m4a|flac)(\?.*)?$/i.test(src)) return 'audio'
        if (/^https?:\/\//i.test(src)) return 'iframe'

        return 'unknown'
    }

    protected isMediaElement(element: Element): element is MediaElement {
        return element instanceof HTMLImageElement
            || element instanceof HTMLVideoElement
            || element instanceof HTMLAudioElement
            || element instanceof HTMLIFrameElement
    }

    protected matchesType(element: Element, type: MediaType) {
        if (type === 'image') return element instanceof HTMLImageElement
        if (type === 'video') return element instanceof HTMLVideoElement
        if (type === 'audio') return element instanceof HTMLAudioElement
        if (type === 'iframe') return element instanceof HTMLIFrameElement

        return this.isMediaElement(element)
    }
}