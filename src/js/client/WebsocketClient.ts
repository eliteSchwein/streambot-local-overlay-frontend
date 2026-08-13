import { Websocket, WebsocketEvent } from "websocket-ts";
import { getConfig } from "../helper/ConfigHelper";
import {sleep} from "../helper/GeneralHelper";

declare global {
    interface Window {
        websocket?: Websocket;
    }
}

export default class WebsocketClient {
    private websocket!: Websocket;
    private url!: string;

    private reconnecting = false;
    private hasReloadedAfterReconnect = false;

    private readonly baseDelayMs = 2_000;
    private readonly maxDelayMs = 60_000;

    public async connect() {
        const config = getConfig(/websocket/g)[0];
        this.url = `ws://${window.location.hostname}:${config?.port ?? 8100}`;

        this.openWebsocket();
        await sleep(500);
    }

    private openWebsocket() {
        if (window.websocket) {
            this.websocket = window.websocket;
            return;
        }

        this.websocket = new Websocket(this.url);

        this.websocket.addEventListener(WebsocketEvent.open, () => {
            console.log("Websocket connected");

            window.websocket = this.websocket;

            this.registerEndpoints([
                "notify_game_update",
                "notify_shield_mode",
                "notify_test_mode",
                "notify_service_reload",
            ]);

            this.websocket.addEventListener(WebsocketEvent.message, (websocket, event) => {
                const data = JSON.parse(event.data)

                if (
                    data.method !== "notify_service_reload" ||
                    data.params?.type !== "overlay"
                ) {
                    return
                }

                console.log(
                    "[cold-reload] received reload signal, reloading page"
                )

                window.location.reload()
            })

            if (this.reconnecting && !this.hasReloadedAfterReconnect) {
                this.hasReloadedAfterReconnect = true;

                console.log(
                    "[cold-reload] WebSocket reconnected, reloading page"
                );

                window.location.reload(true);
                return;
            }

            this.reconnecting = false;
        });

        this.websocket.addEventListener(WebsocketEvent.close, (event) => {
            console.log("Websocket closed", event);

            if (window.websocket === this.websocket) {
                delete window.websocket;
            }

            if (!this.reconnecting) {
                this.reconnecting = true;
                this.hasReloadedAfterReconnect = false;

                void this.tryReconnect();
            }
        });

        this.websocket.addEventListener(WebsocketEvent.error, (event) => {
            console.warn("Websocket error", event);
        });

        window.websocket = this.websocket;
    }

    private async tryReconnect() {
        let attempt = 0;

        while (this.reconnecting) {
            attempt++;

            const delay = Math.min(
                this.baseDelayMs * 2 ** (attempt - 1),
                this.maxDelayMs
            );

            const jitter = delay * (0.75 + Math.random() * 0.5);

            console.log(
                `Reconnecting WebSocket (attempt ${attempt}) in ${Math.round(jitter)}ms...`
            );

            await sleep(jitter);

            try {
                delete window.websocket;
                this.openWebsocket();

                const opened = await this.waitForOpen(5_000);

                if (opened) {
                    return;
                }

                try {
                    this.websocket.close();
                } catch {
                    // Ignore already closed WebSockets.
                }
            } catch (error) {
                console.warn(
                    "Reconnect attempt failed to initialize:",
                    error
                );
            }
        }
    }

    private waitForOpen(timeoutMs: number): Promise<boolean> {
        return new Promise((resolve) => {
            let settled = false;

            const onOpen = () => {
                if (settled) return;

                settled = true;
                cleanup();
                resolve(true);
            };

            const onCloseOrError = () => {
                if (settled) return;

                settled = true;
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                try {
                    this.websocket.removeEventListener(
                        WebsocketEvent.open,
                        onOpen
                    );

                    this.websocket.removeEventListener(
                        WebsocketEvent.close,
                        onCloseOrError
                    );

                    this.websocket.removeEventListener(
                        WebsocketEvent.error,
                        onCloseOrError
                    );
                } catch {
                    // Ignore cleanup errors.
                }
            };

            this.websocket.addEventListener(
                WebsocketEvent.open,
                onOpen
            );

            this.websocket.addEventListener(
                WebsocketEvent.close,
                onCloseOrError
            );

            this.websocket.addEventListener(
                WebsocketEvent.error,
                onCloseOrError
            );

            setTimeout(() => {
                if (settled) return;

                settled = true;
                cleanup();
                resolve(false);
            }, timeoutMs);
        });
    }

    public getWebsocket() {
        return this.websocket;
    }

    public send(method: string, data: any = {}) {
        this.websocket.send(
            JSON.stringify({
                jsonrpc: "2.0",
                method,
                params: data,
                id: getRandomInt(10_000),
            })
        );
    }

    public editColor(color: string | undefined = undefined) {
        this.send("set_color", { color });
    }

    public clearEvent(eventUuid: string) {
        this.send("remove_event", {
            "event-uuid": eventUuid,
        });
    }

    public registerEndpoint(endpoint: string): void {
        this.send("register_endpoints", [endpoint]);
    }

    public registerEndpoints(endpoints: string[]): void {
        if (endpoints.length === 0) return;

        this.send("register_endpoints", endpoints);
    }
}