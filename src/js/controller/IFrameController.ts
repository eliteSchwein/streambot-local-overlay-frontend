import BaseController from "./BaseController";

export default class IFrameController extends BaseController {
    async preConnect() {
        const iframe = this.element; // <iframe>

        // Outer iframe element background
        iframe.style.background = "transparent";

        const inject = () => {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) return;

            const style = doc.createElement("style");
            style.textContent = `
        html, body {
          background: transparent !important;
        }
      `;
            doc.head.appendChild(style);
        };

        // If already loaded, inject immediately
        if (iframe.contentDocument?.readyState === "complete") {
            inject();
        } else {
            // Ensure we inject after iframe content is ready
            iframe.addEventListener("load", inject, { once: true });
        }
    }
}