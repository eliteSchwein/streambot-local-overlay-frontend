import BaseEffect, { EffectOptions } from './BaseEffect'

export interface SlideFadeEffectOptions extends EffectOptions {
    x?: number
    y?: number
    reverse?: boolean
}

export default class SlideFadeEffect extends BaseEffect {
    declare public options: Required<SlideFadeEffectOptions>

    constructor(content: string, id = 'slidefade', options: SlideFadeEffectOptions = {}) {
        super(content, id, options)

        this.options = {
            ...this.options,
            x: options.x ?? 32,
            y: options.y ?? 0,
            reverse: options.reverse ?? false,
        }
    }

    public async handle(element: HTMLElement): Promise<void> {
        await this.animate(
            element,
            this.options.reverse
                ? [
                    { opacity: 1, transform: 'translate(0, 0)' },
                    {
                        opacity: 0,
                        transform: `translate(${this.options.x}px, ${this.options.y}px)`,
                    },
                ]
                : [
                    {
                        opacity: 0,
                        transform: `translate(${this.options.x}px, ${this.options.y}px)`,
                    },
                    { opacity: 1, transform: 'translate(0, 0)' },
                ],
        )
    }
}