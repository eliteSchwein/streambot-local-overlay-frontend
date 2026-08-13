import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

export default class BackgroundController extends BaseController {
    protected videoExtensions = ['mp4','webm']
    protected imageExtensions = ['gif','png','jpg','webp']

    async handleGameUpdate(websocket: Websocket, data: any) {
        let background = data.media.animated_background


        if(!background) {
            background = data.media.static_background
        }

        this.element.innerHTML = ''

        let extension = background
            .split('?')[0]
            .split('.')
            .pop()
            ?.toLowerCase();

        if(this.imageExtensions.includes(extension)) {
            this.element.innerHTML = `<img src="${background}">`;
        }

        if(this.videoExtensions.includes(extension)) {
            this.element.innerHTML = `<video loop muted autoplay><source src="${background}"></video>`;
        }
    }
}