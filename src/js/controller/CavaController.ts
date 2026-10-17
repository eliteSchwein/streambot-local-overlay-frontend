import BaseController from "./BaseController";
import {getConfig} from "../helper/ConfigHelper";

type CavaBar =
    HTMLDivElement |
    SVGRectElement;

type SvgRectData = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type CavaSubscriber = {
    onMessage: (raw: unknown) => void;
    onReset: () => void;
};

type SharedCavaConnection = {
    target: string;

    subscribers:
        Set<CavaSubscriber>;

    websocket?:
        globalThis.WebSocket;

    reconnectTimer?:
        number;

    reconnectAttempt:
        number;
};

const sharedCavaConnections =
    new Map<
        string,
        SharedCavaConnection
    >();

function getCavaUrl(
    target: string
): string {
    const config =
        getConfig(
            /websocket/g
        )[0];

    const port =
        config?.port ??
        8100;

    const protocol =
        window.location.protocol ===
        "https:"
            ? "wss"
            : "ws";

    return (
        `${protocol}://` +
        `${window.location.hostname}` +
        `:${port}` +
        `/cava/` +
        encodeURIComponent(
            target
        )
    );
}

function openSharedCavaConnection(
    connection:
    SharedCavaConnection
): void {
    if (
        connection
            .subscribers
            .size <
        1
    ) {
        return;
    }

    if (
        connection.websocket &&
        (
            connection
                .websocket
                .readyState ===
            globalThis
                .WebSocket
                .OPEN
            ||
            connection
                .websocket
                .readyState ===
            globalThis
                .WebSocket
                .CONNECTING
        )
    ) {
        return;
    }

    console.log(
        `[cava] connect ${connection.target}`
    );

    const websocket =
        new globalThis.WebSocket(
            getCavaUrl(
                connection.target
            )
        );

    connection.websocket =
        websocket;

    websocket.onopen =
        () => {
            if (
                connection
                    .websocket !==
                websocket
            ) {
                return;
            }

            connection
                .reconnectAttempt =
                0;

            console.log(
                `[cava] connected ${connection.target}`
            );
        };

    websocket.onmessage =
        event => {
            if (
                connection
                    .websocket !==
                websocket
            ) {
                return;
            }

            for (
                const subscriber
                of connection
                .subscribers
                ) {
                try {
                    subscriber
                        .onMessage(
                            event.data
                        );
                } catch (
                    error
                    ) {
                    console.warn(
                        `[cava] ${connection.target} message failed`,
                        error
                    );
                }
            }
        };

    websocket.onerror =
        () => {
            // onclose handles reconnecting
        };

    websocket.onclose =
        () => {
            if (
                connection
                    .websocket !==
                websocket
            ) {
                return;
            }

            connection.websocket =
                undefined;

            console.log(
                `[cava] disconnected ${connection.target}`
            );

            for (
                const subscriber
                of connection
                .subscribers
                ) {
                try {
                    subscriber
                        .onReset();
                } catch {
                    //
                }
            }

            if (
                connection
                    .subscribers
                    .size <
                1
            ) {
                sharedCavaConnections
                    .delete(
                        connection
                            .target
                    );

                return;
            }

            scheduleSharedCavaReconnect(
                connection
            );
        };
}

function scheduleSharedCavaReconnect(
    connection:
    SharedCavaConnection
): void {
    if (
        connection
            .subscribers
            .size <
        1
        ||
        connection
            .reconnectTimer !==
        undefined
    ) {
        return;
    }

    connection
        .reconnectAttempt++;

    const delay =
        Math.min(
            1000 *
            2 **
            Math.min(
                connection
                    .reconnectAttempt -
                1,
                4
            ),
            15000
        );

    connection.reconnectTimer =
        window.setTimeout(
            () => {
                connection
                    .reconnectTimer =
                    undefined;

                openSharedCavaConnection(
                    connection
                );
            },
            delay
        );
}

function subscribeToCava(
    target: string,
    subscriber:
    CavaSubscriber
): () => void {
    let connection =
        sharedCavaConnections
            .get(
                target
            );

    if (
        !connection
    ) {
        connection = {
            target,

            subscribers:
                new Set<
                    CavaSubscriber
                >(),

            reconnectAttempt:
                0,
        };

        sharedCavaConnections
            .set(
                target,
                connection
            );
    }

    connection
        .subscribers
        .add(
            subscriber
        );

    openSharedCavaConnection(
        connection
    );

    return () => {
        const current =
            sharedCavaConnections
                .get(
                    target
                );

        if (
            !current
        ) {
            return;
        }

        current
            .subscribers
            .delete(
                subscriber
            );

        if (
            current
                .subscribers
                .size >
            0
        ) {
            return;
        }

        if (
            current
                .reconnectTimer !==
            undefined
        ) {
            window.clearTimeout(
                current
                    .reconnectTimer
            );

            current
                .reconnectTimer =
                undefined;
        }

        const websocket =
            current
                .websocket;

        current.websocket =
            undefined;

        if (
            websocket
        ) {
            websocket.onopen =
                null;

            websocket.onmessage =
                null;

            websocket.onerror =
                null;

            websocket.onclose =
                null;

            try {
                websocket.close();
            } catch {
                //
            }
        }

        sharedCavaConnections
            .delete(
                target
            );
    };
}

export default class CavaController
    extends BaseController {

    websocketEndpoints:
        string[] = [];

    protected bars:
        CavaBar[] = [];

    protected values:
        number[] = [];

    protected smoothedValues:
        number[] = [];

    protected cavaBuffer =
        "";

    protected expectedBarCount =
        0;

    protected framerate =
        60;

    protected target =
        "default";

    protected smoothing =
        0.45;

    protected falloffPerSecond =
        360;

    protected isSvgMode =
        false;

    protected invertBars =
        false;

    protected svgRectData =
        new Map<
            SVGRectElement,
            SvgRectData
        >();

    protected unsubscribeCava?:
        () => void;

    async preConnect() {
        this.isSvgMode =
            this.element instanceof
            SVGElement;

        this.target =
            this.element
                .getAttribute(
                    "data-cava-target"
                )
                ?.trim()
            ||
            "default";

        this.invertBars =
            this.element
                .getAttribute(
                    "data-cava-invert-bars"
                ) ===
            "true";

        this.element
            .classList
            .add(
                "cava-controller"
            );

        this.element
            .classList
            .toggle(
                "cava-invert-bars",
                this.invertBars
            );

        if (
            this.isSvgMode
        ) {
            this.captureOriginalSvgBars();
        }
    }

    async postConnect() {
        this.unsubscribeCava?.();

        const subscriber:
            CavaSubscriber = {
            onMessage:
                raw =>
                    this.handleCavaMessage(
                        raw
                    ),

            onReset:
                () =>
                    this.resetCava(),
        };

        this.unsubscribeCava =
            subscribeToCava(
                this.target,
                subscriber
            );
    }

    disconnect() {
        this.unsubscribeCava?.();

        this.unsubscribeCava =
            undefined;

        this.resetCava();
    }

    protected handleCavaMessage(
        raw: unknown
    ): void {
        if (
            typeof raw !==
            "string"
        ) {
            return;
        }

        let message:
            any;

        try {
            message =
                JSON.parse(
                    raw
                );
        } catch {
            return;
        }

        if (
            message?.method !==
            "notify_music_cava"
        ) {
            return;
        }

        const data =
            message?.params ??
            {};

        const frameTarget =
            String(
                data?.target ??
                this.target
            ).trim()
            ||
            this.target;

        if (
            frameTarget !==
            this.target
        ) {
            return;
        }

        this.updateMetadata(
            data
        );

        if (
            this.expectedBarCount <=
            0
        ) {
            return;
        }

        const frames =
            this.parseCavaFrames(
                String(
                    data?.raw ??
                    ""
                )
            );

        for (
            const frame
            of frames
            ) {
            if (
                frame.length <
                1
            ) {
                continue;
            }

            const values =
                frame.slice(
                    0,
                    this.expectedBarCount
                );

            while (
                values.length <
                this.expectedBarCount
                ) {
                values.push(
                    0
                );
            }

            this.values =
                values;

            this.smoothValues();

            this.render();
        }
    }

    protected updateMetadata(
        data: any
    ): void {
        const bars =
            Math.floor(
                Number(
                    data?.bars ??
                    0
                )
            );

        if (
            Number.isFinite(
                bars
            )
            &&
            bars > 0
            &&
            bars !==
            this.expectedBarCount
        ) {
            this.expectedBarCount =
                bars;

            this.ensureBars(
                bars
            );
        }

        const framerate =
            Math.floor(
                Number(
                    data?.framerate ??
                    0
                )
            );

        if (
            Number.isFinite(
                framerate
            )
            &&
            framerate >
            0
        ) {
            this.framerate =
                framerate;
        }
    }

    protected parseCavaFrames(
        raw: string
    ): number[][] {
        if (
            !raw
        ) {
            return [];
        }

        this.cavaBuffer +=
            raw;

        const lines =
            this.cavaBuffer
                .split(
                    /\r?\n/
                );

        this.cavaBuffer =
            lines.pop()
            ??
            "";

        return lines
            .map(
                line =>
                    line.trim()
            )
            .filter(
                line =>
                    line.length >
                    0
            )
            .map(
                line => {
                    const values =
                        line
                            .split(
                                /[;,\s]+/
                            )
                            .map(
                                value =>
                                    Number(
                                        value
                                    )
                            )
                            .filter(
                                value =>
                                    Number.isFinite(
                                        value
                                    )
                            )
                            .map(
                                value =>
                                    Math.max(
                                        0,
                                        Math.min(
                                            100,
                                            value
                                        )
                                    )
                            );

                    if (
                        this.expectedBarCount >
                        0 &&
                        values.length >
                        this.expectedBarCount
                    ) {
                        values.length =
                            this.expectedBarCount;
                    }

                    return values;
                }
            )
            .filter(
                values =>
                    values.length >
                    0
            );
    }

    protected ensureBars(
        count: number
    ): void {
        if (
            count <= 0
        ) {
            return;
        }

        if (
            this.isSvgMode
        ) {
            this.ensureSvgBars(
                count
            );

            return;
        }

        if (
            this.bars.length ===
            count
        ) {
            this.resizeValueBuffers(
                count
            );

            return;
        }

        this.element.innerHTML =
            "";

        this.bars =
            [];

        this.values =
            new Array(
                count
            ).fill(
                0
            );

        this.smoothedValues =
            new Array(
                count
            ).fill(
                0
            );

        for (
            let i = 0;
            i < count;
            i++
        ) {
            const bar =
                document
                    .createElement(
                        "div"
                    );

            bar.classList.add(
                "cava-bar"
            );

            bar.style.alignSelf =
                this.invertBars
                    ? "flex-start"
                    : "flex-end";

            bar.style.height =
                "0%";

            this.element
                .appendChild(
                    bar
                );

            this.bars.push(
                bar
            );
        }
    }

    protected resizeValueBuffers(
        count: number
    ): void {
        if (
            this.values.length !==
            count
        ) {
            const values =
                new Array(
                    count
                ).fill(
                    0
                );

            for (
                let i = 0;
                i <
                Math.min(
                    count,
                    this.values.length
                );
                i++
            ) {
                values[i] =
                    this.values[i] ??
                    0;
            }

            this.values =
                values;
        }

        if (
            this.smoothedValues.length !==
            count
        ) {
            const smoothed =
                new Array(
                    count
                ).fill(
                    0
                );

            for (
                let i = 0;
                i <
                Math.min(
                    count,
                    this.smoothedValues.length
                );
                i++
            ) {
                smoothed[i] =
                    this.smoothedValues[i] ??
                    0;
            }

            this.smoothedValues =
                smoothed;
        }
    }

    protected captureOriginalSvgBars():
        void {
        const rects =
            Array.from(
                this.element
                    .querySelectorAll(
                        ":scope > rect"
                    )
            ) as SVGRectElement[];

        this.svgRectData
            .clear();

        for (
            const rect
            of rects
            ) {
            const data:
                SvgRectData = {
                x:
                    Number(
                        rect
                            .getAttribute(
                                "x"
                            )
                        ??
                        0
                    ),

                y:
                    Number(
                        rect
                            .getAttribute(
                                "y"
                            )
                        ??
                        0
                    ),

                width:
                    Number(
                        rect
                            .getAttribute(
                                "width"
                            )
                        ??
                        0
                    ),

                height:
                    Number(
                        rect
                            .getAttribute(
                                "height"
                            )
                        ??
                        0
                    ),
            };

            this.svgRectData
                .set(
                    rect,
                    data
                );
        }

        this.bars =
            rects;
    }

    protected ensureSvgBars(
        count: number
    ): void {
        let rects =
            Array.from(
                this.element
                    .querySelectorAll(
                        ":scope > rect"
                    )
            ) as SVGRectElement[];

        if (
            rects.length <
            1
        ) {
            return;
        }

        const reference =
            rects[0];

        let referenceData =
            this.svgRectData
                .get(
                    reference
                );

        if (
            !referenceData
        ) {
            referenceData =
                this.readSvgGeometry(
                    reference
                );

            this.svgRectData
                .set(
                    reference,
                    referenceData
                );
        }

        const second =
            rects[1];

        let secondData:
            SvgRectData |
            undefined;

        if (
            second
        ) {
            secondData =
                this.svgRectData
                    .get(
                        second
                    );

            if (
                !secondData
            ) {
                secondData =
                    this.readSvgGeometry(
                        second
                    );

                this.svgRectData
                    .set(
                        second,
                        secondData
                    );
            }
        }

        const calculatedStep =
            secondData
                ? secondData.x -
                referenceData.x
                : referenceData.width +
                1;

        const stepX =
            Number.isFinite(
                calculatedStep
            )
            &&
            calculatedStep !==
            0
                ? calculatedStep
                : referenceData.width +
                1;

        while (
            rects.length <
            count
            ) {
            const index =
                rects.length;

            const clone = reference.cloneNode(true) as SVGRectElement;

            const geometry:
                SvgRectData = {
                x:
                    referenceData.x +
                    stepX *
                    index,

                y:
                referenceData.y,

                width:
                referenceData.width,

                height:
                referenceData.height,
            };

            this.writeSvgGeometry(
                clone,
                geometry
            );

            this.svgRectData
                .set(
                    clone,
                    geometry
                );

            this.element
                .appendChild(
                    clone
                );

            rects.push(
                clone
            );
        }

        this.bars =
            rects.slice(
                0,
                count
            );

        this.resizeValueBuffers(
            count
        );

        for (
            let i =
                count;
            i <
            rects.length;
            i++
        ) {
            const rect =
                rects[i];

            const original =
                this.svgRectData
                    .get(
                        rect
                    );

            if (
                !original
            ) {
                continue;
            }

            rect.setAttribute(
                "height",
                "0"
            );

            rect.setAttribute(
                "y",
                String(
                    this.invertBars
                        ? original.y
                        : original.y +
                        original.height
                )
            );
        }
    }

    protected readSvgGeometry(
        rect:
        SVGRectElement
    ): SvgRectData {
        return {
            x:
                Number(
                    rect
                        .getAttribute(
                            "x"
                        )
                    ??
                    0
                ),

            y:
                Number(
                    rect
                        .getAttribute(
                            "y"
                        )
                    ??
                    0
                ),

            width:
                Number(
                    rect
                        .getAttribute(
                            "width"
                        )
                    ??
                    0
                ),

            height:
                Number(
                    rect
                        .getAttribute(
                            "height"
                        )
                    ??
                    0
                ),
        };
    }

    protected writeSvgGeometry(
        rect:
        SVGRectElement,

        geometry:
        SvgRectData
    ): void {
        rect.setAttribute(
            "x",
            String(
                geometry.x
            )
        );

        rect.setAttribute(
            "y",
            String(
                geometry.y
            )
        );

        rect.setAttribute(
            "width",
            String(
                geometry.width
            )
        );

        rect.setAttribute(
            "height",
            String(
                geometry.height
            )
        );
    }

    protected smoothValues():
        void {
        if (
            this.expectedBarCount <=
            0
        ) {
            return;
        }

        this.resizeValueBuffers(
            this.expectedBarCount
        );

        const frameFalloff =
            this.falloffPerSecond /
            Math.max(
                1,
                this.framerate
            );

        for (
            let i = 0;
            i <
            this.expectedBarCount;
            i++
        ) {
            const target =
                this.values[i]
                ??
                0;

            const current =
                this.smoothedValues[i]
                ??
                0;

            if (
                target >
                current
            ) {
                this.smoothedValues[i] =
                    current +
                    (
                        target -
                        current
                    ) *
                    this.smoothing;
            } else {
                this.smoothedValues[i] =
                    Math.max(
                        target,
                        current -
                        frameFalloff
                    );
            }
        }
    }

    protected render():
        void {
        if (
            this.isSvgMode
        ) {
            this.renderSvgBars();

            return;
        }

        this.renderHtmlBars();
    }

    protected renderHtmlBars():
        void {
        for (
            let i = 0;
            i <
            this.bars.length;
            i++
        ) {
            const bar = this.bars[i] as HTMLDivElement;

            const value =
                this.smoothedValues[i]
                ??
                0;

            bar.style.alignSelf =
                this.invertBars
                    ? "flex-start"
                    : "flex-end";

            bar.style.height =
                value > 0
                    ? `${Math.max(
                        3,
                        value
                    )}%`
                    : "0%";
        }
    }

    protected renderSvgBars():
        void {
        for (
            let i = 0;
            i <
            this.bars.length;
            i++
        ) {
            const rect = this.bars[i] as SVGRectElement;

            const original =
                this.svgRectData
                    .get(
                        rect
                    );

            if (
                !original
            ) {
                continue;
            }

            const value =
                this.smoothedValues[i]
                ??
                0;

            const height =
                value > 0
                    ? Math.max(
                        1,
                        original.height *
                        (
                            value /
                            100
                        )
                    )
                    : 0;

            const y =
                this.invertBars
                    ? original.y
                    : original.y +
                    original.height -
                    height;

            rect.setAttribute(
                "height",
                String(
                    height
                )
            );

            rect.setAttribute(
                "y",
                String(
                    y
                )
            );
        }
    }

    protected resetCava():
        void {
        this.cavaBuffer =
            "";

        this.values =
            new Array(
                this.expectedBarCount
            ).fill(
                0
            );

        this.smoothedValues =
            new Array(
                this.expectedBarCount
            ).fill(
                0
            );

        if (
            this.expectedBarCount >
            0
        ) {
            this.render();
        }
    }
}