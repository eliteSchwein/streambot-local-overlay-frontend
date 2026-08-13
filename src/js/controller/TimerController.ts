import BaseController from "./BaseController";
import {Websocket} from "websocket-ts";
import {sleep} from "../helper/GeneralHelper";

export default class TimerController extends BaseController {
    websocketEndpoints = ['notify_timer']

    static targets = ['leadingMinute', 'lastMinute', 'leadingSecond', 'lastSecond', 'progressBar', 'progressBg']

    declare readonly leadingMinuteTargets: HTMLDivElement[]
    declare readonly lastMinuteTargets: HTMLDivElement[]
    declare readonly leadingSecondTargets: HTMLDivElement[]
    declare readonly lastSecondTargets: HTMLDivElement[]
    declare readonly progressBarTargets: HTMLDivElement[]
    declare readonly progressBgTargets: HTMLDivElement[]

    protected name: string

    async postConnect() {
        this.name = this.element.getAttribute('data-timer-name') as string
    }

    async handleGameUpdate(websocket: Websocket, data: any) {
    }

    async handleMessage(websocket: Websocket, method: string, data: any) {
        if(method !== 'notify_timer') return

        if(data.name !== this.name) return

        this.alertBoxHelper.setTopBarProgress(data.progress)
        this.setCircleProgress(data.progress)

        switch (data.action) {
            case "update":
                this.element.classList.remove('blink')
                this.handleTimerUpdate(data)
                return
            case "finish":
                this.handleTimerUpdate(data)
                void this.handleTimerFinish(data)
                return
        }
    }

    private async handleTimerFinish(data: any) {
        switch (data.end) {
            case 'fate':
                await sleep(1000 * 2)
                this.element.parentElement.style.opacity = '0'
                return
            case 'blink':
                this.element.classList.add('blink')
                return
        }
    }

    private handleTimerUpdate(data: any) {
        this.element.parentElement.style.opacity = null
        const date = new Date(data.time * 1000);
        let hours:any = date.getUTCHours();
        let minutes: any = date.getUTCMinutes();
        let seconds: any = date.getSeconds();

        if (hours < 10) {hours = "0"+hours;}
        if (minutes < 10) {minutes = "0"+minutes;}
        if (seconds < 10) {seconds = "0"+seconds;}

        hours = `${hours}`
        minutes = `${minutes}`
        seconds = `${seconds}`

        const leadingMinute = minutes.substring(0, 1)
        const lastMinute = minutes.substring(1)
        const leadingSecond = seconds.substring(0, 1)
        const lastSecond = seconds.substring(1)

        if(this.leadingMinuteTargets[0].innerHTML !== leadingMinute) {
            void this.updateContent('leadingMinute', leadingMinute)
        }

        if(this.lastMinuteTargets[0].innerHTML !== lastMinute) {
            void this.updateContent('lastMinute', lastMinute)
        }

        if(this.leadingSecondTargets[0].innerHTML !== leadingSecond) {
            void this.updateContent('leadingSecond', leadingSecond)
        }

        if(this.lastSecondTargets[0].innerHTML !== lastSecond) {
            void this.updateContent('lastSecond', lastSecond)
        }
    }

    private setCircleProgress(progress: any) {
        const progressNumber = Number(progress)

        if (Number.isNaN(progressNumber)) return

        const normalizedProgress = progressNumber <= 1
            ? progressNumber * 100
            : progressNumber

        const clampedProgress = Math.min(100, Math.max(0, normalizedProgress))

        for (const element of [
            ...this.progressBarTargets,
            ...this.progressBgTargets,
        ]) {
            element.style.setProperty('--progress', `${clampedProgress}%`)
        }
    }

    private async updateContent(type: string, content: string) {
        for(const element of this[`${type}Targets`]) {
            element.style.display = 'none'
        }

        for(const element of this[`${type}Targets`]) {
            element.innerHTML = content
        }

        await sleep(25)

        for(const element of this[`${type}Targets`]) {
            element.style.display = null
        }
    }
}