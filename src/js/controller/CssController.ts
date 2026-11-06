import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

type Declaration = {
    value: string
    priority: string
}

type ElementState = {
    // css per selector, in the order they were applied (later wins)
    overrides: Map<string, string>
    // inline values the element had before we touched a property
    originals: Map<string, Declaration>
}

/**
 * Overrides inline styles of elements matching a css selector inside this
 * controller's element (the element itself included).
 *
 * The backend adds this controller to the <body> of every overlay page.
 *
 * notify_css_update: {action: 'set' | 'append' | 'reset', selector?, css?}
 */
export default class CssController extends BaseController {
    websocketEndpoints = ['notify_css_update']
    // lives on <body>, so it must not take over the page's first alert box
    useAlertBox = false

    private states = new Map<HTMLElement, ElementState>()

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if (method !== 'notify_css_update' || !data) return

        const selector = String(data.selector ?? '').trim()
        const css = String(data.css ?? '')

        switch (data.action) {
            case 'reset':
                this.reset(selector)
                return
            case 'append':
                this.apply(selector, css, true)
                return
            default:
                this.apply(selector, css, false)
        }
    }

    private apply(selector: string, css: string, append: boolean) {
        if (!selector) return

        for (const element of this.findElements(selector)) {
            let state = this.states.get(element)

            if (!state) {
                state = {overrides: new Map(), originals: new Map()}
                this.states.set(element, state)
            }

            const previous = state.overrides.get(selector)

            state.overrides.delete(selector)
            state.overrides.set(selector, append && previous ? `${previous};${css}` : css)

            this.render(element, state)
        }
    }

    private reset(selector: string) {
        for (const [element, state] of this.states) {
            if (selector) {
                if (!state.overrides.delete(selector)) continue
            } else {
                state.overrides.clear()
            }

            this.render(element, state)
        }
    }

    private render(element: HTMLElement, state: ElementState) {
        const declarations = new Map<string, Declaration>()

        for (const css of state.overrides.values()) {
            for (const [property, declaration] of parseDeclarations(css)) {
                declarations.set(property, declaration)
            }
        }

        // restore properties that are no longer overridden
        for (const [property, original] of state.originals) {
            if (declarations.has(property)) continue

            if (original.value) {
                element.style.setProperty(property, original.value, original.priority)
            } else {
                element.style.removeProperty(property)
            }

            state.originals.delete(property)
        }

        for (const [property, declaration] of declarations) {
            if (!state.originals.has(property)) {
                state.originals.set(property, {
                    value: element.style.getPropertyValue(property),
                    priority: element.style.getPropertyPriority(property),
                })
            }

            element.style.setProperty(property, declaration.value, declaration.priority)
        }

        if (state.overrides.size === 0 || !element.isConnected) {
            this.states.delete(element)
        }
    }

    private findElements(selector: string): HTMLElement[] {
        try {
            const elements = [...this.element.querySelectorAll<HTMLElement>(selector)]

            if (this.element.matches(selector)) {
                elements.unshift(this.element)
            }

            return elements
        } catch (error) {
            console.warn('[css] invalid selector', selector, error)
            return []
        }
    }
}

function parseDeclarations(css: string): Map<string, Declaration> {
    const declarations = new Map<string, Declaration>()

    // allow "{ color: red }" as well as "color: red"
    const style = document.createElement('div').style
    style.cssText = css.trim().replace(/^\{/, '').replace(/}$/, '')

    for (let index = 0; index < style.length; index++) {
        const property = style.item(index)

        declarations.set(property, {
            value: style.getPropertyValue(property),
            priority: style.getPropertyPriority(property),
        })
    }

    return declarations
}
