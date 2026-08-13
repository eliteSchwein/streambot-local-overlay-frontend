import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

export default class VisibleController extends BaseController {
    websocketEndpoints = ['notify_visible_element']

    protected id = this.element.dataset.id


    async handleMessage(websocket: Websocket, method: string, data: any) {
        if(!data) return
        if(method === 'notify_test_mode') {
            data.target = this.id
            data.state = data.active
        }
        if(!data.target || data.target !== this.id) return
        if(data.state === undefined) return

        if(method !== 'notify_test_mode' && method !== 'notify_visible_element') return

        switch (data.state) {
            case true:
                if(this.alertBoxHelper.isPresent()) {
                    this.alertBoxHelper.show()
                    break
                }
                this.element.style.display = null
                break
            case false:
                if(this.alertBoxHelper.isPresent()) {
                    this.alertBoxHelper.hide()
                    break
                }
                this.element.style.display = 'none'
                break
        }
    }
}