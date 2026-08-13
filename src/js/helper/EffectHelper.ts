import type BaseEffect from '../effects/BaseEffect'

import FadeEffect from '../effects/FadeEffect'
import SlideEffect from '../effects/SlideEffect'
import SlideFadeEffect from "../effects/SlideFadeEffect";
import ScaleEffect from "../effects/ScaleEffect";

type EffectClass = new (
    content: string,
    id?: string,
    options?: Record<string, unknown>,
) => BaseEffect

const effects: Record<string, EffectClass> = {}

export async function initEffects(): Promise<void> {
    effects.fade = FadeEffect
    effects.slide = SlideEffect
    effects.slidefade = SlideFadeEffect
    effects.scale = ScaleEffect
}

export async function triggerEffect(
    id: string,
    element: HTMLElement,
    content: string,
    options: Record<string, unknown> = {},
): Promise<void> {
    const Effect = effects[id]

    if (!Effect) {
        throw new Error(`Effect "${id}" not found`)
    }

    const effect = new Effect(content, id, options)

    effect.setContent(element)

    await effect.handle(element)
}