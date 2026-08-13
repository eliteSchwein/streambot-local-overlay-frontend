// BaseEffect.ts
export interface EffectOptions {
    duration?: number
    delay?: number
    easing?: string
}

export default abstract class BaseEffect {
    public content: string
    public id: string
    public options: Required<EffectOptions>

    constructor(content: string, id: string, options: EffectOptions = {}) {
        this.content = content
        this.id = id

        this.options = {
            duration: options.duration ?? 300,
            delay: options.delay ?? 0,
            easing: options.easing ?? 'ease',
        }
    }

    public abstract handle(element: HTMLElement): Promise<void>

    public setContent(element: HTMLElement): void {
        const contentElement = element.querySelector<HTMLElement>(
            '[data-effect-content="true"]',
        )

        if (contentElement) {
            contentElement.innerHTML = this.content
            return
        }
    }

    public getContent(): string {
        return this.content
    }

    protected animate(
        element: HTMLElement,
        keyframes: Keyframe[],
    ): Promise<void> {
        return new Promise((resolve) => {
            const animation = element.animate(keyframes, {
                duration: this.options.duration,
                delay: this.options.delay,
                easing: this.options.easing,
                fill: 'forwards',
            })

            animation.onfinish = () => resolve()
        })
    }
}