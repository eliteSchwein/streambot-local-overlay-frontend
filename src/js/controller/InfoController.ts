import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

export default class InfoController extends BaseController {
    async handleGameUpdate(websocket: Websocket, data: any) {
        const gameInfoElements = this.element.querySelectorAll('[data-info]') as NodeListOf<HTMLElement>;

        gameInfoElements.forEach(element => {
            switch (element.dataset.info) {
                case 'game':
                    element.innerHTML = data.game_name
            }
        })
    }
}