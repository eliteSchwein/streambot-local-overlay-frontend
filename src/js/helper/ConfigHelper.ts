let config: any

export default async function fetchConfig() {
    config = await (await fetch('/config.json')).json();
}

export function getConfig(filter: RegExp|undefined = undefined, asObject = false) {
    if(!filter) return config

    const result: any = []

    for (const key in config) {
        if(!key.match(filter)) {
            continue
        }

        if(asObject) {
            const realKey = key.replace(filter, '')
            result[realKey] = config[key]
        } else {
            result.push(config[key])
        }
    }

    return result
}