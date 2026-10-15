import {Controller} from "@hotwired/stimulus";
import {getWebsocketClient} from "../../App";
import {Websocket, WebsocketEvent} from "websocket-ts";
import WebsocketClient from "../client/WebsocketClient";
import AlertBoxHelper from "../helper/AlertBoxHelper";

export default class BaseController extends Controller<HTMLElement> {
    websocket: WebsocketClient;
    shieldActive = false;
    websocketEndpoints: string[] = [];

    // Additional stateful endpoints used by this controller.
    // The global state endpoints below are handled for every BaseController.
    statefulWebsocketEndpoints: string[] = [];

    // Stateful endpoints that represent multiple named/targeted entities.
    // The value is the identity property used to keep independent state caches.
    entityStatefulWebsocketEndpoints: Record<string, string> = {};

    protected websocketState = new Map<string, any>();
    protected websocketEntityState = new Map<string, Map<string, any>>();
    protected websocketEntityLastKey = new Map<string, string>();

    alertBoxHelper: AlertBoxHelper

    async register() {
        this.websocket = getWebsocketClient()

        // Attach the listener before registering endpoints. Backend 2.0 sends
        // the full state immediately on first registration, so registering first
        // can lose the only complete snapshot.
        this.websocket.getWebsocket().addEventListener(
            WebsocketEvent.message,
            (websocket, event) => this.handleWebsocket(websocket, event)
        )

        this.websocket.getWebsocket().addEventListener(
            WebsocketEvent.close,
            () => {
                this.websocketState.clear()
                this.websocketEntityState.clear()
                this.websocketEntityLastKey.clear()
            }
        )

        this.websocket.registerEndpoints(this.websocketEndpoints)

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

        if (!data?.method) {
            return
        }

        if(data.params?.error) {
            console.warn(data)
            return
        }

        const params = this.isEntityStatefulWebsocketEndpoint(data.method)
            ? this.mergeEntityStatefulWebsocketData(data.method, data.params)
            : this.isStatefulWebsocketEndpoint(data.method)
                ? this.mergeStatefulWebsocketData(data.method, data.params)
                : data.params

        if(
            data.method === 'notify_game_update'
        ) {
            const gameData = params?.data

            if (!gameData) {
                return
            }

            const themeData = gameData.theme
            await this.handleGameUpdate(websocket, gameData)

            this.applyTheme(themeData)
            return
        }

        if(data.method === 'notify_shield_mode') {
            this.shieldActive = params?.action === 'enable'
            await this.handleShield()
        }

        await this.handleMessage(websocket, data.method, params)
    }

    protected isStatefulWebsocketEndpoint(method: string): boolean {
        return [
            'notify_game_update',
            'notify_shield_mode',
            'notify_test_mode',
            ...this.statefulWebsocketEndpoints,
        ].includes(method)
    }

    protected isEntityStatefulWebsocketEndpoint(method: string): boolean {
        return Object.prototype.hasOwnProperty.call(
            this.entityStatefulWebsocketEndpoints,
            method
        )
    }

    protected mergeEntityStatefulWebsocketData(method: string, patch: any): any {
        if (patch === null || patch === undefined || typeof patch !== 'object' || Array.isArray(patch)) {
            return patch
        }

        const identityProperty = this.entityStatefulWebsocketEndpoints[method]
        if (!identityProperty) {
            return patch
        }

        const patchIdentity = patch[identityProperty]
        let entityKey = patchIdentity !== undefined && patchIdentity !== null
            ? String(patchIdentity)
            : this.websocketEntityLastKey.get(method)

        // A delta without its identity can only be reconstructed after a full
        // packet for the same method established which entity is being updated.
        if (!entityKey) {
            return patch
        }

        this.websocketEntityLastKey.set(method, entityKey)

        let methodState = this.websocketEntityState.get(method)
        if (!methodState) {
            methodState = new Map<string, any>()
            this.websocketEntityState.set(method, methodState)
        }

        const previous = methodState.get(entityKey)
        const normalizedPatch = patchIdentity === undefined
            ? { ...patch, [identityProperty]: entityKey }
            : patch

        const merged = previous === undefined
            ? this.cloneWebsocketValue(normalizedPatch)
            : this.deepMergeWebsocketValue(previous, normalizedPatch)

        methodState.set(entityKey, merged)
        return merged
    }

    protected mergeStatefulWebsocketData(method: string, patch: any): any {
        if (!this.websocketState.has(method)) {
            const initial = this.cloneWebsocketValue(patch)
            this.websocketState.set(method, initial)
            return initial
        }

        const merged = this.deepMergeWebsocketValue(
            this.websocketState.get(method),
            patch
        )

        this.websocketState.set(method, merged)
        return merged
    }

    protected deepMergeWebsocketValue(current: any, patch: any): any {
        // null is an explicit tombstone/value from the backend.
        if (patch === null) {
            return null
        }

        // Arrays and primitive values are atomic and replace the previous value.
        if (Array.isArray(patch) || typeof patch !== 'object') {
            return this.cloneWebsocketValue(patch)
        }

        if (patch === undefined) {
            return current
        }

        const base = (
            current !== null &&
            typeof current === 'object' &&
            !Array.isArray(current)
        )
            ? current
            : {}

        const result: Record<string, any> = { ...base }

        for (const [key, value] of Object.entries(patch)) {
            result[key] = this.deepMergeWebsocketValue(result[key], value)
        }

        return result
    }

    protected cloneWebsocketValue(value: any): any {
        if (Array.isArray(value)) {
            return value.map(item => this.cloneWebsocketValue(item))
        }

        if (value !== null && typeof value === 'object') {
            const clone: Record<string, any> = {}

            for (const [key, nestedValue] of Object.entries(value)) {
                clone[key] = this.cloneWebsocketValue(nestedValue)
            }

            return clone
        }

        return value
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