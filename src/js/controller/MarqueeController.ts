import BaseController from "./BaseController";

export default class MarqueeController extends BaseController {
    protected currentContent = ''

    async postConnect() {
        const observer = new MutationObserver((mutationsList, observer) => {
            if(this.element.innerHTML === this.currentContent) return
            this.currentContent = this.element.innerHTML

            requestAnimationFrame(() => this.addMarquee());
        })

        observer.observe(this.element, {
            childList: true,
            subtree: true,
            characterData: true
        })

        window.addEventListener("resize", (event) => {
            this.addMarquee()
        })
    }

    private addMarquee() {
        const parentElement = this.element.parentElement as HTMLDivElement;
        if (!parentElement) return;

        // Reset first so measurement is based on normal layout
        parentElement.classList.remove('marquee');

        const visibleWidth = parentElement.clientWidth;
        const fullWidth = Math.ceil(this.element.scrollWidth);

        if (fullWidth > visibleWidth) {
            parentElement.classList.add('marquee');
        }
    }
}
