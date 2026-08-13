import BaseController from "./BaseController";
import ParticleHelper from "../helper/ParticleHelper";
import {Websocket} from "websocket-ts";

export default class ParticlesController extends BaseController {
    protected particle: ParticleHelper

    async postConnect() {
        this.particle = new ParticleHelper()
        await this.particle.loadParticle(this.element)
    }

    async handleGameUpdate(websocket: Websocket, data: any) {
        await this.particle.loadThemeColor(data.theme.color)
    }
}