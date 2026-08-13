import BaseEffect, { EffectOptions } from './BaseEffect'

export interface ScaleEffectOptions extends EffectOptions {
    scale?: number
    fromScale?: number
    hold_duration?: number
}

export default class ScaleEffect extends BaseEffect {
    declare public options: Required<ScaleEffectOptions>

    constructor(content: string, id = 'scale', options: ScaleEffectOptions = {}) {
        super(content, id, options)

        this.options = {
            ...this.options,
            scale: options.scale ?? 1,
            fromScale: options.fromScale ?? 1,
            hold_duration: options.hold_duration ?? 0,
        }
    }

    public async handle(element: HTMLElement): Promise<void> {
        element.style.transformOrigin = 'center center'

        if (!this.options.duration) {
            element.style.transform = `scale(${this.options.scale})`
            return
        }

        await this.animate(element, [
            { transform: `scale(${this.options.fromScale})` },
            { transform: `scale(${this.options.scale})` },
        ])

        if (this.options.hold_duration > 0) {
            await this.sleep(this.options.hold_duration)

            await this.animate(element, [
                { transform: `scale(${this.options.scale})` },
                { transform: `scale(${this.options.fromScale})` },
            ])
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}