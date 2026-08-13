import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";

export default class SvgController extends BaseController {
    private themeElements = []
    private src = this.element.dataset.src

    async postConnect() {
        if(this.src === "function_attribute") {
            const params = new URLSearchParams(document.location.search)
            if(!params.has("svg_file")) return

            this.src = `/${params.get("svg_file")}.svg`
        }

        const request = await fetch(this.src)

        if(request.status !== 200) return

        const content = new DOMParser().parseFromString(await request.text(), 'text/html')
        const parsedContent = content.querySelector('svg') as SVGElement

        if(!parsedContent) return

        this.element.innerHTML = parsedContent.innerHTML

        this.element.setAttribute('viewBox', parsedContent.getAttribute('viewBox'))

        let hasStyle = true

        // @ts-ignore
        let svgStyleElement = this.element.querySelector('style') as SVGStyleElement

        if (!svgStyleElement) {
            svgStyleElement = document.createElementNS("http://www.w3.org/2000/svg", "style") as SVGStyleElement
            //svgStyleElement.innerHTML = `.insvg-fader {
            //    transition: all 1s ease-in-out;
            //  }`
            this.element.appendChild(svgStyleElement)
            hasStyle = false
        }

        let styleContent = svgStyleElement.innerHTML

        const svgElements = this.element.querySelectorAll('*')

        svgElements.forEach((element) => {
            const computedFill = getComputedStyle(element).fill;
            if (computedFill !== "rgb(255, 165, 165)") return

            this.themeElements.push(element)

            if(hasStyle) return

            element.classList.add('insvg-fader')
        })

        //styleContent = styleContent.replace(/fill:\s*#ffa5a5/g, 'transition: all 1s ease-in-out')

        svgStyleElement.innerHTML = styleContent
    }

    async handleGameUpdate(websocket: Websocket, data: any) {
        this.themeElements.forEach((themeElement) => {
            themeElement.style.fill = data.theme.color
        })
    }
}