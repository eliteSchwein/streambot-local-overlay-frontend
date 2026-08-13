import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

export default class SourceBackgroundController extends BaseController {
    websocketEndpoints = ['notify_source_update']

    protected videoExtensions = ['mp4','webm']
    protected imageExtensions = ['gif','png','jpg','webp']

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (method !== 'notify_source_update') {
            return
        }

        const backgroundType = this.element.getAttribute('data-source-background-type')

        let background = data.background

        if (
            backgroundType &&
            data.backgrounds &&
            data.backgrounds[backgroundType]
        ) {
            background = data.backgrounds[backgroundType]
        }

        this.element.innerHTML = ''

        // strip URL parameters
        let extension = background.split('?')[0].split('.').pop()?.toLowerCase()

        if (!extension) {
            return
        }

        if (this.imageExtensions.includes(extension)) {
            this.element.innerHTML = `<img src="${background}">`
        }

        if (this.videoExtensions.includes(extension)) {
            this.element.innerHTML = `
            <video loop muted autoplay playsinline>
                <source src="${background}">
            </video>
        `
        }
    }
}