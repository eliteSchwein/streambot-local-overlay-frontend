export type VirtualAudioCableInfo = {
    cable: string
    device: string
    active: boolean
    transport: 'webrtc'
    codec: 'opus'
    sample_rate: number
    channels: number
    bitrate: number
    whep: {
        port: number
        path: string
    }
}

export default class VirtualAudioWebRtcClient {
    private peer?: RTCPeerConnection
    private sessionUrl?: string
    private audioElement?: HTMLAudioElement

    async connect(
        cable: VirtualAudioCableInfo,
        audioElement: HTMLAudioElement
    ) {
        await this.disconnect()

        const protocol =
            window.location.protocol === 'https:'
                ? 'https:'
                : 'http:'

        const whepUrl =
            `${protocol}//${window.location.hostname}:${cable.whep.port}${cable.whep.path}`

        const peer =
            new RTCPeerConnection()

        this.peer = peer
        this.audioElement = audioElement

        peer.addTransceiver(
            'audio',
            {
                direction: 'recvonly',
            }
        )

        const stream =
            new MediaStream()

        peer.addEventListener(
            'track',
            event => {
                const tracks =
                    event.streams[0]
                        ?.getTracks() ??
                    [event.track]

                for (const track of tracks) {
                    if (
                        !stream.getTrackById(
                            track.id
                        )
                    ) {
                        stream.addTrack(track)
                    }
                }

                audioElement.srcObject =
                    stream

                void audioElement
                    .play()
                    .catch(() => undefined)
            }
        )

        peer.addEventListener(
            'connectionstatechange',
            () => {
                if (
                    peer.connectionState ===
                    'failed' ||
                    peer.connectionState ===
                    'closed'
                ) {
                    void this.disconnect()
                }
            }
        )

        const offer =
            await peer.createOffer()

        await peer.setLocalDescription(
            offer
        )

        await this.waitForIceGathering(
            peer
        )

        const response =
            await fetch(
                whepUrl,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/sdp',
                    },
                    body:
                        peer.localDescription
                            ?.sdp ??
                        offer.sdp ??
                        '',
                }
            )

        if (!response.ok) {
            await this.disconnect()

            throw new Error(
                `WHEP connection failed: HTTP ${response.status}`
            )
        }

        const location =
            response.headers.get(
                'Location'
            )

        if (location) {
            this.sessionUrl =
                new URL(
                    location,
                    whepUrl
                ).toString()
        }

        const answerSdp =
            await response.text()

        await peer.setRemoteDescription({
            type: 'answer',
            sdp: answerSdp,
        })
    }

    async disconnect() {
        const sessionUrl =
            this.sessionUrl

        this.sessionUrl = undefined

        if (sessionUrl) {
            try {
                await fetch(
                    sessionUrl,
                    {
                        method: 'DELETE',
                    }
                )
            } catch {
                // MediaMTX session may already be gone.
            }
        }

        if (this.audioElement) {
            this.audioElement.pause()
            this.audioElement.srcObject =
                null

            this.audioElement =
                undefined
        }

        if (this.peer) {
            this.peer.close()
            this.peer = undefined
        }
    }

    private waitForIceGathering(
        peer: RTCPeerConnection
    ): Promise<void> {
        if (
            peer.iceGatheringState ===
            'complete'
        ) {
            return Promise.resolve()
        }

        return new Promise(
            resolve => {
                const done = () => {
                    if (
                        peer.iceGatheringState !==
                        'complete'
                    ) {
                        return
                    }

                    peer.removeEventListener(
                        'icegatheringstatechange',
                        done
                    )

                    resolve()
                }

                peer.addEventListener(
                    'icegatheringstatechange',
                    done
                )

                window.setTimeout(
                    () => {
                        peer.removeEventListener(
                            'icegatheringstatechange',
                            done
                        )

                        resolve()
                    },
                    2000
                )
            }
        )
    }
}