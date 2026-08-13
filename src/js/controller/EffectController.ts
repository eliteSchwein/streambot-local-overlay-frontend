import BaseController from './BaseController'
import { Websocket } from 'websocket-ts'
import {triggerEffect } from '../helper/EffectHelper'

export default class EffectController extends BaseController {
    websocketEndpoints = ['notify_effect']

    protected effectsInitialized = false

    async postConnect() {
        this.websocket.send('get_effect', {})
    }

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (method !== 'notify_effect') {
            return
        }

        const target = this.element.dataset.effectTarget

        if (!target || data.target !== target) {
            return
        }

        if (!data.effect) {
            this.element.innerHTML = ''
            return
        }

        await triggerEffect(
            data.effect,
            this.element,
            data.content ?? '',
            data.options ?? {},
        )
    }
}