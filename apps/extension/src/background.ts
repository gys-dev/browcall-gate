import { ConnectWindowEnum, TabSession } from "interfaces";
import { log } from "./common/utils";

// tab -> session
const activeSession = new Map<number, TabSession>();
// socketPort -> array of messages { uuid, tabId } attached for session
const sessionMessage = new Map<number, { uuid: string, tabId: number }[]>()

chrome.runtime.onMessage.addListener((event, sender, callback) => {
    log('background.ts onMessage', event, sender, callback)
    switch (event.source) {
        case ConnectWindowEnum.NewSession: {
            const { apiPort, tabId, socketPort } = event.payload;
            if (!apiPort || !socketPort) {
                return
            }

            activeSession.set(tabId, event.payload);
            if (!sessionMessage.has(socketPort)) {
                sessionMessage.set(socketPort, []);
            }

            log("New session created:", sessionMessage);
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
            const session = activeSession.get(tabId);
            if (!session) {
                log("No active session found for tabId:", tabId);
                return;
            }

            const { socketPort } = session;
            activeSession.delete(tabId);

            const hasOtherTabForPort = Array.from(activeSession.values()).some(s => s.socketPort === socketPort);
            if (!hasOtherTabForPort) {
                sessionMessage.delete(socketPort);
            } else {
                const messages = sessionMessage.get(socketPort);
                if (messages) {
                    const remaining = messages.filter(m => m.tabId !== tabId);
                    sessionMessage.set(socketPort, remaining);
                }
            }

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
            const tabId = sender.tab?.id || event.payload?.tabId;
            const { uuid } = event.payload || {};
            log(activeSession)
            const session = activeSession.get(tabId || 0);
            const socketPort = session?.socketPort || event.payload?.socketPort;

            if (!socketPort) {
                log("No active session or socketPort found for tabId:", tabId);
                callback(false)
                break;
            }

            log("Polling session for tabId", tabId, "with socketPort", socketPort)

            let messageTabs = sessionMessage.get(socketPort);
            if (!messageTabs) {
                callback(true)
                break
            }

            const isOccupied = messageTabs.some(tab => tab.tabId == tabId);
            if (isOccupied) {
                callback(false)
                break;
            }

            callback(true)
            break;
        }

        case ConnectWindowEnum.Occupied: {
            const tabId = sender.tab?.id || event.payload?.tabId;
            const session = activeSession.get(tabId || 0);
            const socketPort = session?.socketPort || event.payload?.socketPort;

            if (!socketPort || !tabId) {
                log("No active session, socketPort, or tabId found:", { tabId, socketPort });
                break;
                return;
            }

            const { uuid } = event.payload || {};

            let messages = sessionMessage.get(socketPort);
            if (!messages) {
                messages = [{ uuid, tabId }];
                sessionMessage.set(socketPort, messages);
            }

            const existingIndex = messages.findIndex(m => m.uuid === uuid && m.tabId === tabId);
            if (existingIndex === -1) {
                messages.push({ uuid, tabId });
            }

            log("Tab", tabId, "is now occupied with socketPort", socketPort, "message:", uuid)
            break;
        }

        case ConnectWindowEnum.Available: {
            const tabId = sender.tab?.id || event.payload?.tabId;
            const session = activeSession.get(tabId || 0);
            const socketPort = session?.socketPort || event.payload?.socketPort;

            if (!socketPort || !tabId) {
                log("No active session, socketPort, or tabId found:", { tabId, socketPort });
                break;
                return;
            }

            const { uuid, messageId } = event.payload || {};
            const msgUuid = uuid || messageId;
            const messages = sessionMessage.get(socketPort);

            if (messages) {
                if (msgUuid) {
                    const index = messages.findIndex(m => m.tabId === tabId);
                    if (index !== -1) {
                        messages.splice(index, 1);
                    }
                } else {
                    for (let i = messages.length - 1; i >= 0; i--) {
                        if (messages[i].tabId === tabId) {
                            messages.splice(i, 1);
                        }
                    }
                }
            }

            log("Tab", tabId, "is now available with socketPort", socketPort)
            break;
        }
        default:
            log("Unknown message source:", event.source);

    }
})