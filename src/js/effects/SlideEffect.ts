import BaseEffect, { EffectOptions } from './BaseEffect'

export interface SlideEffectOptions extends EffectOptions {
    x?: number
    y?: number
}

export default class SlideEffect extends BaseEffect {
    declare public options: Required<SlideEffectOptions>

    constructor(content: string, id = 'slide', options: SlideEffectOptions = {}) {
        super(content, id, {
            duration: options.duration,
            delay: options.delay,
            easing: options.easing,
        })

        this.options = {
            ...this.options,
            x: options.x ?? 0,
            y: options.y ?? 32,
        }
    }

    public async handle(element: HTMLElement): Promise<void> {
        await this.animate(element, [
            {
                transform: `translate(${this.options.x}px, ${this.options.y}px)`,
            },
            {
                transform: 'translate(0, 0)',
            },
        ])
    }
}