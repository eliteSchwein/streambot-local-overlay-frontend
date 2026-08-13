// styles
import "./style/global.css"
import "./style/fonts.css"
import "./style/animation.css"
import "./style/background.css"
import "./style/badge.css"
import "./style/alert.css"
import "./style/timer.css"
import "./style/announce.css"
import "./style/toggle.css"
import "./style/randomclips.css"
import "./style/music.css"
import "./style/spacing.css"
import "bootstrap/dist/css/bootstrap.css"
import "@mdi/font/css/materialdesignicons.css"

// javascript
import WebsocketClient from "./js/client/WebsocketClient";
import {Application} from "@hotwired/stimulus";
import BackgroundController from "./js/controller/BackgroundController";
import BadgeController from "./js/controller/BadgeController";
import fetchConfig from "./js/helper/ConfigHelper";
import * as packageConfig from '../package.json'
import {loadFull} from "tsparticles";
import {tsParticles} from "@tsparticles/engine"
import AlertController from "./js/controller/AlertController";
import TimerController from "./js/controller/TimerController";
import AnnounceController from "./js/controller/AnnounceController";
import EffectController from "./js/controller/EffectController";
import SvgController from "./js/controller/SvgController";
import ToggleController from "./js/controller/ToggleController";
import RandomClipsController from "./js/controller/RandomClipsController";
import InfoController from "./js/controller/InfoController";
import SourceBackgroundController from "./js/controller/SourceBackgroundController";
import MusicController from "./js/controller/MusicController";
import VisibleController from "./js/controller/VisibleController";
import MarqueeController from "./js/controller/MarqueeController";
import ContenController from "./js/controller/ContenController";
import IFrameController from "./js/controller/IFrameController";
import {initEffects} from "./js/helper/EffectHelper";
import CavaController from "./js/controller/CavaController";
import AnimationController from "./js/controller/AnimationController";
import ParticlesController from "./js/controller/ParticlesController";
import MediaController from "./js/controller/MediaController";
import {sleep} from "./js/helper/GeneralHelper";

// variables
let websocketClient: WebsocketClient

void init()

async function init(){
    console.log(`Starting ${packageConfig.name} ${packageConfig.version} frontend...`)
    await fetchConfig()

    await loadFull(tsParticles);
    await initEffects()

    websocketClient = new WebsocketClient()
    await websocketClient.connect()

    const stimulus = Application.start()
    stimulus.register('content', ContenController)
    stimulus.register('background', BackgroundController)
    stimulus.register('badge', BadgeController)
    stimulus.register('alert', AlertController)
    stimulus.register('timer', TimerController)
    stimulus.register('announce', AnnounceController)
    stimulus.register('effect', EffectController)
    stimulus.register('svg', SvgController)
    stimulus.register('toggle', ToggleController)
    stimulus.register('random_clips', RandomClipsController)
    stimulus.register('info', InfoController)
    stimulus.register('source_background', SourceBackgroundController)
    stimulus.register('music', MusicController)
    stimulus.register('visible', VisibleController)
    stimulus.register('marquee', MarqueeController)
    stimulus.register('iframe', IFrameController)
    stimulus.register('cava', CavaController)
    stimulus.register('animation', AnimationController)
    stimulus.register('particles', ParticlesController)
    stimulus.register('media', MediaController)

    await sleep(250)

    websocketClient.registerEndpoints(['notify_game_update', 'notify_shield_mode', 'notify_test_mode'])
}

export function getWebsocketClient() {
    return websocketClient
}