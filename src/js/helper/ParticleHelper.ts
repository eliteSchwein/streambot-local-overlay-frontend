import {Container, tsParticles} from "@tsparticles/engine"
import sciencePreset from "../../particles/science.json"
import matrixPreset from "../../particles/matrix.json"
import firePreset from "../../particles/fire.json"
import spacePreset from "../../particles/space.json"

type ParticlePresetName = "science" | "matrix" | "fire" | "space"
type ParticleConfig = any

const presets: Record<ParticlePresetName, ParticleConfig> = {
    science: sciencePreset,
    matrix: matrixPreset,
    fire: firePreset,
    space: spacePreset,
};

export default class ParticleHelper {
    private config: ParticleConfig = this.createConfig("science")
    private container: Container
    private element: HTMLElement
    private themeColor: string

    public async loadParticle(element: HTMLElement) {
        if (!element) return
        if (element.hasAttribute("data-disable-particles")) return

        this.destroyParticle()

        this.element = element
        this.config = this.createConfig(this.getPresetFromElement(element))

        this.config.autoPlay = true
        this.config.fullScreen = {
            "enable": false,
            "zIndex": 0
        }
        delete this.config.interactivity

        if (this.themeColor) {
            this.applyThemeColor(this.themeColor)
        }

        this.container = await tsParticles.load({
            element: element,
            options: this.config
        })
    }

    public destroyParticle() {
        if(this.container) {
            this.container.destroy(true)
        }
    }

    private setValueByPath(target: any, path: string, value: any) {
        const keys = path.split(".").filter(Boolean);
        let current = target

        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) return
            current = current[keys[i]]
        }

        current[keys[keys.length - 1]] = value
    }

    public async loadThemeColor(color: string) {
        this.themeColor = color
        await this.loadParticle(this.element)
    }

    private getPresetFromElement(element: HTMLElement): ParticlePresetName {
        const preset = element.getAttribute("data-particles-preset") as ParticlePresetName | null

        if(preset && presets[preset]) {
            return preset
        }

        return "science"
    }

    private createConfig(preset: ParticlePresetName): ParticleConfig {
        return structuredClone(presets[preset])
    }

    private applyThemeColor(color: string) {
        const themeKeys = this.config?.themeKeys

        if (Array.isArray(themeKeys) && themeKeys.length) {
            for (const themeKey of themeKeys) {
                this.setValueByPath(this.config, themeKey, color)
            }

            return
        }

        this.config.particles.color.value = color

        if (this.config.particles.links?.color?.value) {
            this.config.particles.links.color.value = color
        }
    }
}
