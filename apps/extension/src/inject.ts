import { showOverlay, updateStatus } from "./common/dom";
import { ConnectState, Host, SessionPayload } from "./common/interface";
import { getApp, log } from "./common/utils";
import { WSSingleton } from "./common/ws-singleton";
import { ContentAppAbstract } from "./content/content.abstract";
import { OpenAIContentApp } from "./content/openai";
import { PerplexityContentApp } from "./content/perplexity/index";
import { CommuteEvent, ConnectWindowEnum } from "@interfaces";


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

persistConnect();

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

function connect(connectProps: SessionPayload) {
    const { tabId, socketPort, apiPort } = connectProps;

    WSSingleton.setSingletonPort(socketPort);
    websocket = WSSingleton.getSocket();
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

    WSSingleton.onClose((event) => {
        showOverlay(false)
        log("On connect close", event)
        // TODO: remove session from extension
    })


    WSSingleton.onMessage((event) => onMessageSessionReceive(event, {
        apiPort,
        socketPort,
        tabId
    }))

    WSSingleton.onError((event) => {
        log("On connect error", event)
    })
}

async function persistConnect() {
    const tabId = await chrome.runtime.sendMessage({ source: ConnectWindowEnum.GetTabId })
    if (!tabId) {
        throw Error("Could not get tab info")
    }

    const session = await chrome.runtime.sendMessage({
        source: ConnectWindowEnum.GetSession,
        payload: {
            tabId
        }
    })

    log("persist connect", session)

    if (session) {
        connect(session)
    }
}

chrome.runtime.onMessage.addListener((event) => {
    switch (event.source) {
        case ConnectWindowEnum.SetPorts: {
            // const { tabId, socketPort, apiPort } = event.payload;

            log("Connect window!!")
            connect(event.payload)

            break;
        }

        case ConnectWindowEnum.Disconnected: {
            log("disconnect requirement")
            showOverlay(false)
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

