// effects/FadeEffect.ts
import BaseEffect, { EffectOptions } from './BaseEffect'

export interface FadeEffectOptions extends EffectOptions {
    reverse?: boolean
}

export default class FadeEffect extends BaseEffect {
    declare public options: Required<FadeEffectOptions>

    constructor(content: string, id = 'fade', options: FadeEffectOptions = {}) {
        super(content, id, options)

        this.options = {
            ...this.options,
            reverse: options.reverse ?? false,
        }
    }

    public async handle(element: HTMLElement): Promise<void> {
        await this.animate(
            element,
            this.options.reverse
                ? [{ opacity: 1 }, { opacity: 0 }]
                : [{ opacity: 0 }, { opacity: 1 }],
        )
    }
}