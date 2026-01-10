import { showOverlay, updateStatus } from "./common/dom";
import { Host } from "./common/interface";
import { getApp, log } from "./common/utils";
import { WSSingleton } from "./common/ws-singleton";
import { ContentAppAbstract } from "./content/content.abstract";
import { OpenAIContentApp } from "./content/openai";
import { PerplexityContentApp } from "./content/perplexity/index";
import { CommuteEvent, ConnectWindowEnum } from "@lib/interfaces";


/* -------------------- bootstrap (content-script safe) -------------------- */

log('Injecting Perplexity content script');

const hostname = window.location.hostname;
const appName = getApp(hostname);
let websocket: WebSocket;

chrome.storage.sync.set({ 'socketStatus': 'disconnected' })

let app: ContentAppAbstract;
switch (appName) {
    case Host.PerplexityAI:
        app = new PerplexityContentApp();
        break;

    case Host.ChatGPT:
        log('ChatGPT content app not implemented yet');
        app = new OpenAIContentApp();
        break;
    default:
        log('No matching content app for hostname:', hostname);
        break;
}

/* -------------------- handle status event (content-script safe) -------------------- */

const onMessageSessionReceive = (eventMessage: MessageEvent, payload: Record<string, any>) => {
    log("onMessageReceive", eventMessage)
    const eventData = eventMessage.data;
    const event = JSON.parse(eventData);

    switch (event.type) {
        case CommuteEvent.RegisterResponse: {
            const { tabId, apiPort, socketPort } = payload;
            log("register sugeest")
            log("send event to background to register session")
            chrome.runtime.sendMessage({
                source: ConnectWindowEnum.NewSession,
                payload: {
                    tabId,
                    apiPort,
                    socketPort
                }
            })
            break;
        }
        default:

    }
}

chrome.runtime.onMessage.addListener((event) => {

    switch (event.source) {
        case ConnectWindowEnum.SetPorts: {
            const { tabId, socketPort, apiPort } = event.payload;

            WSSingleton.setSingletonPort(socketPort);
            websocket = WSSingleton.getSocket();
            log("connect again")
            WSSingleton.onOpen((event) => {
                log("On connect event", event)
                app.init()
                showOverlay(true)

                log("send event", websocket)
                websocket.send(JSON.stringify({
                    type: CommuteEvent.Register,
                    data: tabId
                }))

                chrome.storage.sync.set({ 'socketStatus': 'connected' })

                updateStatus(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    document.querySelector("#contentAppStatus")!,
                    apiPort,
                    socketPort,
                    'connected'
                )
            })


            WSSingleton.onMessage((event) => onMessageSessionReceive(event, {
                apiPort,
                socketPort,
                tabId
            }))

            WSSingleton.onError((event) => {
                log("On connect error", event)

                // showOverlay(true)

                // updateStatus(
                //     // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                //     document.querySelector("#contentAppStatus")!,
                //     apiPort,
                //     socketPort,
                //     'error'
                // )
            })
            break;
        }

        case ConnectWindowEnum.Disconnect: {
            showOverlay(false)
            chrome.storage.sync.set({ 'socketStatus': 'disconnected' })
            updateStatus(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                document.querySelector("#contentAppStatus")!,
                0,
                0,
                'disconnected'
            )
            WSSingleton.disconnect()


            break;

        }
        default:
    }
});

