import BaseController from "./BaseController";
import qrcode from "qrcode-generator";

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'
type TypeNumber = Parameters<typeof qrcode>[0]

// the default encoder truncates every char to one byte, encode urls as utf-8 instead
qrcode.stringToBytes = (text: string) => Array.from(new TextEncoder().encode(text))

/**
 * Renders a QR code as a crisp, scalable inline svg.
 *
 * <div data-controller="qrcode"
 *      data-qrcode-url="https://example.com"  (the url/text to encode, ?qr_url=... in the page url overrides it)
 *      data-qrcode-level="M"                  (optional, error correction: L | M | Q | H)
 *      data-qrcode-margin="0"                 (optional, quiet zone in modules)
 *      data-qrcode-version="0"                (optional, 1-40 forces a denser code, 0 = smallest that fits)
 *      data-qrcode-color="#000"               (optional, module color, default currentColor)
 *      data-qrcode-background="#fff"          (optional, background color, default transparent)
 * >
 *     <span data-qrcode-target="code"></span>   (optional, svg is rendered here, otherwise into the element)
 *     <span data-qrcode-target="label"></span>  (optional, receives the encoded url as text)
 * </div>
 */
export default class QrCodeController extends BaseController {
    static targets = ['code', 'label']

    declare readonly hasCodeTarget: boolean
    declare readonly codeTarget: HTMLElement
    declare readonly labelTargets: HTMLElement[]

    useAlertBox = false

    async postConnect() {
        const params = new URLSearchParams(document.location.search)
        const url = params.get('qr_url') ?? this.element.dataset.qrcodeUrl ?? ''

        this.render(url)
    }

    render(url: string) {
        for (const label of this.labelTargets) {
            label.textContent = url
        }

        const container = this.hasCodeTarget ? this.codeTarget : this.element

        if (!url) {
            container.innerHTML = ''
            return
        }

        const level = (this.element.dataset.qrcodeLevel ?? 'M').toUpperCase() as ErrorCorrectionLevel
        const margin = Math.max(0, Number(this.element.dataset.qrcodeMargin ?? 0) || 0)
        const color = this.element.dataset.qrcodeColor ?? 'currentColor'
        const background = this.element.dataset.qrcodeBackground

        const correction = ['L', 'M', 'Q', 'H'].includes(level) ? level : 'M'
        const version = Math.min(40, Math.max(0, Math.floor(Number(this.element.dataset.qrcodeVersion ?? 0) || 0)))

        let qr = qrcode(version as TypeNumber, correction)
        qr.addData(url)

        try {
            qr.make()
        } catch (error) {
            // the fixed version is too small for the url, let the library pick one
            qr = qrcode(0, correction)
            qr.addData(url)
            qr.make()
        }

        const count = qr.getModuleCount()
        const size = count + margin * 2
        let path = ''

        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (!qr.isDark(row, col)) continue
                path += `M${col + margin},${row + margin}h1v1h-1z`
            }
        }

        const backgroundRect = background
            ? `<rect width="${size}" height="${size}" fill="${background}"/>`
            : ''

        container.innerHTML =
            `<svg class="qrcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
            `shape-rendering="crispEdges" width="100%" height="100%">` +
            `${backgroundRect}<path d="${path}" fill="${color}"/></svg>`
    }
}
