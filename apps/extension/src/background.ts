import { ConnectWindowEnum } from "@lib/interfaces";

console.log("hi")
chrome.runtime.onMessage.addListener((event) => {
    switch (event.source) {
        case ConnectWindowEnum.NewSession: {
            const { apiPort, tabId, socketPort} = event.payload;

            console.log("EVENT REQUEST: ", event.payload)
            break;
        }
    }
})