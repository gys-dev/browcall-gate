import { ConnectWindowEnum } from "interfaces";

export async function getTabSession() {
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

    return session;
   
}