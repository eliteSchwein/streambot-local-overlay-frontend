import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

/**
 * Shows a bot variable and keeps it updated.
 *
 * <span data-controller="variable"
 *       data-variable-key="deaths"            (dot path for object values: "stats.deaths")
 *       data-variable-fallback="0"            (optional, shown while the variable is not set)
 *       data-variable-format="{value} Deaths" (optional)
 * ></span>
 *
 * The rendered text is also written to data-variable-value for css hooks.
 */
export default class VariableController extends BaseController {
    websocketEndpoints = ['notify_variables_update', 'notify_overlay_variable']
    // the backend sends notify_variables_update as deltas after the first full state
    statefulWebsocketEndpoints = ['notify_variables_update']

    private key = (this.element.dataset.variableKey ?? '').trim()
    private fallback = this.element.dataset.variableFallback ?? ''
    private format = this.element.dataset.variableFormat ?? ''
    private lastStoredValue: string | undefined

    async postConnect() {
        this.render(undefined)
    }

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (!this.key || !data) return

        const [rootKey, ...path] = this.key.split('.')

        if (method === 'notify_variables_update') {
            const values = data.values ?? {}
            const value = getPath(values[rootKey], path)
            const serialized = JSON.stringify(value)

            // variables updates are sent for every variable, only render on change
            // so values pushed by the overlay_variable task stay until this one changes
            if (serialized === this.lastStoredValue) return

            this.lastStoredValue = serialized
            this.render(value)
            return
        }

        if (method === 'notify_overlay_variable') {
            if (data.key === this.key) {
                this.render(data.value)
            } else if (data.key === rootKey) {
                this.render(getPath(data.value, path))
            }
        }
    }

    private render(value: any) {
        let text: string

        if (value === undefined || value === null) {
            text = this.fallback
        } else if (typeof value === 'object') {
            text = JSON.stringify(value)
        } else {
            text = String(value)
        }

        this.element.dataset.variableValue = text
        this.element.textContent = this.format
            ? this.format.split('{value}').join(text)
            : text
    }
}

function getPath(value: any, path: string[]): any {
    for (const part of path) {
        if (value === undefined || value === null) return undefined
        value = value[part]
    }

    return value
}
