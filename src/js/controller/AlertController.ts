import BaseController from './BaseController'
import { Websocket } from 'websocket-ts'
import {sleep} from "../helper/GeneralHelper";

export default class AlertController extends BaseController {
    websocketEndpoints = ['notify_alert']

    static targets = ['element']

    declare readonly elementTargets: HTMLElement[]

    iconTarget: HTMLElement | null = null
    contentTargets: HTMLDivElement[] = []
    delayedTargets: HTMLDivElement[] = []
    contentContainerTarget: HTMLDivElement | null = null
    videoTarget: HTMLVideoElement | null = null
    logoTarget: HTMLImageElement | null = null
    imageTarget: HTMLImageElement | null = null
    iframeTarget: HTMLIFrameElement | null = null

    protected channel: string | null = ''
    protected visible = false

    /**
     * True when the controller temporarily changed the root element
     * from opacity 0 to opacity 1.
     */
    protected restoreOpacity = false

    /**
     * Incremented whenever a new alert is shown.
     *
     * This prevents an older hide operation from clearing the contents
     * of a newer alert after its fade delay has completed.
     */
    protected alertGeneration = 0

    protected resetActiveTypeElements(): void {
        this.element
            .querySelectorAll<HTMLElement>('[data-alert-active-type]')
            .forEach(element => {
                element.style.display = 'none'
            })
    }

    protected showActiveTypeElements(types: string[]): void {
        for (const type of types) {
            this.element
                .querySelectorAll<HTMLElement>(
                    `[data-alert-active-type="${type}"]`,
                )
                .forEach(element => {
                    element.style.display = ''
                })
        }
    }

    async postConnect(): Promise<void> {
        for (const element of this.elementTargets) {
            if (!element.dataset.alertElementType) continue

            switch (element.dataset.alertElementType) {
                case 'icon':
                    this.iconTarget = element
                    break

                case 'content':
                    this.contentTargets.push(element as HTMLDivElement)
                    break

                case 'delayed':
                    this.delayedTargets.push(element as HTMLDivElement)
                    break

                case 'content-container':
                case 'contentContainer':
                    this.contentContainerTarget =
                        element as HTMLDivElement
                    break

                case 'video':
                    this.videoTarget = element as HTMLVideoElement
                    break

                case 'logo':
                    this.logoTarget = element as HTMLImageElement
                    break

                case 'image':
                    this.imageTarget = element as HTMLImageElement
                    break

                case 'iframe':
                    this.iframeTarget = element as HTMLIFrameElement
                    break
            }
        }

        this.videoTarget?.addEventListener('ended', event => {
            this.videoEnd(event)
        })

        this.channel = this.element.getAttribute('data-alert-channel')
        this.resetActiveTypeElements()
    }

    videoEnd(_event: Event): void {
        if (this.videoTarget) {
            this.videoTarget.style.opacity = '0'
        }
    }

    async handleMessage(
        websocket: Websocket,
        method: string,
        data: any,
    ): Promise<void> {
        /*
         * Do not modify the original WebSocket payload.
         *
         * In horizontal.html several alert controllers receive the same
         * payload object. Modifying it directly would allow one controller
         * to affect the other controllers.
         */
        const payload = {
            ...data,
        }

        if (method === 'notify_test_mode') {
            payload.channel = this.channel
            payload.action = payload.active ? 'show' : 'hide'
            payload.message = 'TEST TEST TEST TEST'
            payload.icon = 'test-tube'
        }

        if (!payload.channel || payload.channel !== this.channel) {
            return
        }

        if (
            method !== 'notify_alert' &&
            method !== 'notify_test_mode'
        ) {
            return
        }

        switch (payload.action) {
            case 'show':
                await this.showAlert(payload)
                return

            case 'hide':
                await this.hideAlert(payload)
                return
        }
    }

    protected async showAlert(data: any): Promise<void> {
        if (data.dummy) return
        if (this.visible) return

        this.alertGeneration++
        this.visible = true

        /*
         * If the overlay starts hidden using opacity: 0,
         * temporarily make it visible while the alert is active.
         */
        this.restoreOpacity =
            getComputedStyle(this.element).opacity === '0'

        if (this.restoreOpacity) {
            this.element.style.opacity = '1'
        }

        this.resetActiveTypeElements()

        const activeTypes: string[] = []

        if (data.icon) activeTypes.push('icon')
        if (data.video) activeTypes.push('video')
        if (data.sound) activeTypes.push('sound')
        if (data.iframe) activeTypes.push('iframe')
        if (data.image) activeTypes.push('image')
        if (data.logo) activeTypes.push('logo')
        if (data.message) activeTypes.push('text')

        this.showActiveTypeElements(activeTypes)

        this.element.style.height = ''
        this.element.style.width = ''
        this.element.style.padding = ''

        if (this.videoTarget) {
            this.videoTarget.style.opacity = '0'
        }

        if (data.video && this.videoTarget) {
            this.videoTarget.style.display = ''

            try {
                this.videoTarget.muted = true

                const mediaUrl = this.normalizeMediaUrl(data.video)
                const source =
                    this.videoTarget.querySelector<HTMLSourceElement>(
                        'source',
                    )

                if (source) {
                    source.src = mediaUrl
                } else {
                    this.videoTarget.src = mediaUrl
                }

                this.videoTarget.load()

                await sleep(50)

                this.element.style.height =
                    `${this.videoTarget.getBoundingClientRect().height}px`

                await sleep(50)

                this.videoTarget.style.opacity = '1'
                await this.videoTarget.play()

                /*
                 * Play the video's audio through the backend only when
                 * no separate sound was provided.
                 */
                if (!data.sound) {
                    this.websocket.send('play_sound', {
                        sound: data.video,
                        volume: data.volume,
                    })
                }
            } catch (error) {
                console.error(error)
            }
        }

        if (data.sound) {
            try {
                this.websocket.send('play_sound', {
                    sound: data.sound,
                    volume: data.volume,
                })
            } catch (error) {
                console.error(error)
            }
        }

        if (data.iframe && this.iframeTarget) {
            this.element.classList.add('aspect')
            this.iframeTarget.src = data.iframe

            const generation = this.alertGeneration

            setTimeout(() => {
                /*
                 * Do not reveal an iframe belonging to an old alert.
                 */
                if (generation !== this.alertGeneration) return
                if (!this.visible) return

                this.iframeTarget?.classList.remove('d-none')
            }, 2_000)
        }

        if (data.image && this.imageTarget) {
            this.imageTarget.classList.remove('d-none')
            this.imageTarget.src = this.normalizeMediaUrl(data.image)
        }

        if (data.logo && this.logoTarget) {
            this.logoTarget.classList.remove('d-none')
            this.logoTarget.src = data.logo
        }

        const message = String(data.message ?? '')

        for (const contentElement of this.contentTargets) {
            contentElement.innerHTML = message
        }

        const generation = this.alertGeneration

        setTimeout(() => {
            /*
             * Do not modify delayed elements for an alert that has
             * already been hidden or replaced.
             */
            if (generation !== this.alertGeneration) return
            if (!this.visible) return

            for (const delayedElement of this.delayedTargets) {
                delayedElement.style.display = ''
            }
        }, 250)

        if (this.iconTarget) {
            this.iconTarget.setAttribute(
                'class',
                data.icon
                    ? `alert-logo mdi mdi-${data.icon}`
                    : 'alert-logo mdi',
            )
        }
    }

    protected async hideAlert(data: any): Promise<void> {
        if (data.dummy) return

        /*
         * Remember which alert generation this hide belongs to.
         */
        const generation = this.alertGeneration

        try {
            this.videoTarget?.pause()
        } catch (error) {
            console.error(error)
        }

        if (this.videoTarget) {
            this.videoTarget.style.opacity = '0'
        }

        if (this.iframeTarget) {
            this.iframeTarget.src = ''
            this.iframeTarget.classList.add('d-none')
        }

        if (this.logoTarget) {
            this.logoTarget.src = ''
            this.logoTarget.classList.add('d-none')
        }

        if (this.imageTarget) {
            this.imageTarget.src = ''
            this.imageTarget.classList.add('d-none')
        }

        this.element.classList.remove('expand')
        this.element.classList.remove('aspect')
        this.element.style.height = ''
        this.element.style.width = ''
        this.element.style.padding = ''

        await sleep(500)

        /*
         * Another alert was shown while this old alert was fading out.
         * Do not clear the new alert's text, visibility or opacity.
         */
        if (generation !== this.alertGeneration) {
            return
        }

        for (const contentElement of this.contentTargets) {
            contentElement.innerHTML = ''
        }

        for (const delayedElement of this.delayedTargets) {
            delayedElement.style.display = 'none'
        }

        this.iconTarget?.setAttribute('class', 'alert-logo mdi')

        this.resetActiveTypeElements()

        if (this.restoreOpacity) {
            this.element.style.opacity = '0'
            this.restoreOpacity = false
        }

        this.visible = false
    }

    protected normalizeMediaUrl(value: string): string {
        const normalized = String(value ?? '')
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')

        if (!normalized) return ''
        if (/^https?:\/\//i.test(normalized)) return normalized
        if (normalized.startsWith('data:')) return normalized

        return `/${normalized}`
    }

    async handleGameUpdate(
        websocket: Websocket,
        data: any,
    ): Promise<void> {
        if (this.element.hasAttribute('data-disable-theme')) return

        if (this.iconTarget) {
            this.iconTarget.style.color = data.theme.color
        }
    }
}