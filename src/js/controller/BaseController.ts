import {Controller} from "@hotwired/stimulus";
import {getWebsocketClient} from "../../App";
import {Websocket, WebsocketEvent} from "websocket-ts";
import WebsocketClient from "../client/WebsocketClient";
import AlertBoxHelper from "../helper/AlertBoxHelper";

export default class BaseController extends Controller<HTMLElement> {
    websocket: WebsocketClient;
    shieldActive = false;
    websocketEndpoints: string[] = [];

    alertBoxHelper: AlertBoxHelper

    async register() {
        this.websocket = getWebsocketClient()

        this.websocket.registerEndpoints(this.websocketEndpoints)

        this.websocket.getWebsocket().addEventListener(WebsocketEvent.message, (websocket, event) => this.handleWebsocket(websocket, event))

        this.alertBoxHelper = new AlertBoxHelper(this.element.querySelector('.new-alert-box'))
    }

    async connect() {
        console.log('connect', this.identifier, this.element)
        await this.preConnect()
        await this.register()
        await this.postConnect()
    }

    async preConnect() {

    }

    async postConnect() {

    }

    async handleWebsocket(websocket: Websocket, event: MessageEvent) {
        const data = JSON.parse(event.data)

        if(data.params.error) {
            console.warn(data)
            return
        }

        if(
            data.method === 'notify_game_update'
        ) {
            const gameData = data.params.data
            const themeData = gameData.theme
            await this.handleGameUpdate(websocket, gameData)

            this.applyTheme(themeData)
            return
        }

        if(data.method === 'notify_shield_mode') {
            this.shieldActive = data.params.action === 'enable'
            await this.handleShield()
        }

        await this.handleMessage(websocket, data.method, data.params)
    }

    applyTheme(themeData: any) {
        if(!themeData) {
            return
        }

        const root = document.documentElement

        const variableMap: Record<string, string[]> = {
            '--theme-color': ['color', '--theme-color'],
            '--theme-glow-alpha-low': ['glowAlphaLow', '--theme-glow-alpha-low'],
            '--theme-glow-alpha-mid': ['glowAlphaMid', '--theme-glow-alpha-mid'],
            '--theme-glow-alpha-high': ['glowAlphaHigh', '--theme-glow-alpha-high'],
            '--theme-glow-alpha-white': ['glowAlphaWhite', '--theme-glow-alpha-white'],
            '--theme-shine-opacity-start': ['shineOpacityStart', '--theme-shine-opacity-start'],
            '--theme-shine-opacity-peak': ['shineOpacityPeak', '--theme-shine-opacity-peak'],
            '--theme-shine-opacity-mid': ['shineOpacityMid', '--theme-shine-opacity-mid'],
            '--theme-shine-stop-opacity': ['shineStopOpacity', '--theme-shine-stop-opacity'],
        }

        Object.entries(variableMap).forEach(([variableName, themeKeys]) => {
            const value = themeKeys
                .map((themeKey) => themeData[themeKey])
                .find((themeValue) => themeValue !== undefined && themeValue !== null && themeValue !== '')

            if(value === undefined) {
                return
            }

            root.style.setProperty(variableName, String(value))
        })
    }

    async handleShield() {

    }

    async handleGameUpdate(websocket: Websocket, data: any) {

    }

    async handleMessage(websocket: Websocket, method: string, data: any) {

    }
}