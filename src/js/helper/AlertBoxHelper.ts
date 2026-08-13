export default class AlertBoxHelper {
    protected element: HTMLElement

    public constructor(element: HTMLElement) {
        if(!element) return
        this.element = element

        this.hide()
    }

    public hide() {
        if(!this.element) return
        this.addDynamicClass()

        this.element.style.width = '0'
        this.element.style.opacity = '0'
    }

    public show() {
        if(!this.element) return
        this.addDynamicClass()

        const handleTransitionEnd = (event: TransitionEvent) => {
            // only care about width transition (avoid multiple triggers)
            if (event.propertyName === "width") {
                this.element.classList.remove("dynamic");
                this.element.removeEventListener("transitionend", handleTransitionEnd);
            }
        };

        this.element.addEventListener("transitionend", handleTransitionEnd);

        this.element.style.width = '100%'
        this.element.style.opacity = '1'
    }

    private addDynamicClass() {
        if(this.element.classList.contains('dynamic')) {
            return
        }

        this.element.classList.add('dynamic')
    }

    public isVisible() {
        return this.element.style.opacity === '1'
    }

    public isPresent() {
        return !!this.element;
    }

    public setTopBarProgress(progress: number) {
        if(progress < 0) progress = 0
        if(progress > 100) progress = 100

        if(!this.element) return
        if(!this.isPresent()) return

        const topBar = this.element.querySelector('.new-alert-top-bar-content') as HTMLDivElement

        if(!topBar) return

        topBar.style.width = `${progress}%`
    }
}