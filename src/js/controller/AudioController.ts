import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";
import VirtualAudioWebRtcClient, {
    VirtualAudioCableInfo
} from "../client/VirtualAudioWebRtcClient";

export default class AudioController extends BaseController {
    websocketEndpoints = [
        'notify_virtual_audio_cables',
    ]

    protected cableId?: string
    protected audioElement?: HTMLAudioElement

    protected client =
        new VirtualAudioWebRtcClient()

    protected connectedCable?: string
    protected connectGeneration = 0

    async preConnect() {
        this.cableId =
            this.element
                .getAttribute(
                    'data-audio-cable'
                )
                ?.trim() ||
            undefined

        if (!this.cableId) {
            return
        }

        this.audioElement =
            document.createElement(
                'audio'
            )

        this.audioElement.autoplay = true
        this.audioElement.controls = false
        this.audioElement.muted = false

        this.audioElement.style.display =
            'none'

        this.element.appendChild(
            this.audioElement
        )
    }

    async handleMessage(
        websocket: Websocket,
        method: string,
        data: any
    ) {
        if (
            method !==
            'notify_virtual_audio_cables' ||
            !this.cableId ||
            !this.audioElement
        ) {
            return
        }

        const cables =
            Array.isArray(data?.cables)
                ? data.cables
                : []

        const cable =
            cables.find(
                (entry: any) =>
                    String(
                        entry?.cable ?? ''
                    ).trim() ===
                    this.cableId
            ) as
                | VirtualAudioCableInfo
                | undefined

        if (
            !cable ||
            !cable.active ||
            cable.transport !== 'webrtc'
        ) {
            this.connectedCable =
                undefined

            await this.client.disconnect()

            return
        }

        if (
            this.connectedCable ===
            cable.cable
        ) {
            return
        }

        const generation =
            ++this.connectGeneration

        try {
            await this.client.connect(
                cable,
                this.audioElement
            )

            if (
                generation !==
                this.connectGeneration
            ) {
                await this.client.disconnect()
                return
            }

            this.connectedCable =
                cable.cable
        } catch (error) {
            if (
                generation ===
                this.connectGeneration
            ) {
                this.connectedCable =
                    undefined

                console.warn(
                    '[audio] WebRTC connection failed',
                    error
                )
            }
        }
    }

    disconnect() {
        this.connectGeneration++

        this.connectedCable =
            undefined

        void this.client.disconnect()

        if (this.audioElement) {
            this.audioElement.remove()
            this.audioElement =
                undefined
        }
    }
}