import { ConnectWindowEnum } from "interfaces";

const activeSession = new Map<string, any>();

chrome.runtime.onMessage.addListener((event, sender, callback) => {
    switch (event.source) {
        case ConnectWindowEnum.NewSession: {
            const { apiPort, tabId, socketPort } = event.payload;
            if (!apiPort || !socketPort) {
                return
            }

            activeSession.set(tabId, event.payload)
            break;
        }
        case ConnectWindowEnum.GetSession: {
            const { tabId } = event.payload;
            const session = activeSession.get(tabId);
            if (session) {
                callback(session)
            } else {
                callback(null)
            }
            break;
        }
        case ConnectWindowEnum.Disconnect: {
            const { tabId } = event.payload;
            activeSession.delete(tabId)
            chrome.runtime.sendMessage({ payload: { tabId }, source: ConnectWindowEnum.Disconnected })
            chrome.tabs.sendMessage(tabId, {
                payload: tabId,
                source: ConnectWindowEnum.Disconnected
            })
            break;
        }
        case ConnectWindowEnum.GetTabId: {
            callback(sender.tab?.id)
            break;
        }

        case ConnectWindowEnum.PollingSession: {
            const { socketPort } = event.payload;
            const tabId = sender.tab?.id

            console.log(socketPort, tabId)

            // TODO: From port, find all tab in idle -> Manage in tab idle later
            // then return information to permit to start
            // current default true, feature implement later

            callback(true)
            break;
        }

    }
})