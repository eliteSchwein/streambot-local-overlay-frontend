import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

export default class RandomClipsController extends BaseController {
    websocketEndpoints = ["notify_random_clips"];

    static targets = ["iframe"];

    declare readonly iframeTarget: HTMLIFrameElement;

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (method !== "notify_random_clips") return;

        if (data?.action === "disable") {
            this.disable();
            return;
        }

        if (data?.action !== "enable") return;

        this.element.classList.add("visible");
        this.iframeTarget.style.display = "";
        this.iframeTarget.src = data.url;
    }

    private disable() {
        this.iframeTarget.src = "";
        this.iframeTarget.style.display = "none";
        this.element.classList.remove("visible");
    }
}
