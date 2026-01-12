import { useEffect, useState } from "react";
import { useEventWindow } from "./useEventWindow"
import { ConnectWindowEnum } from "interfaces/src";
import { SessionPayload } from "../../common/interface";
import { log } from "../../common/utils";

export function useSession() {
    const [tabId, sendMessage] = useEventWindow()
    const [sessionInfo, setSession] = useState<SessionPayload | null>()

    useEffect(() => {
        if (tabId) {
            getSession()
        }

        // Handle Disconnect Event -> Remove session
        chrome.runtime.onMessage.addListener(event => {


            if (event.source == ConnectWindowEnum.Disconnected) {
                const { tabId: sourceTabId } = event?.payload;
                if (sourceTabId != tabId) {
                    // ignore
                    return;
                }
                log("Disconnect")
                setSession(null)
            }
        })

        chrome.runtime.onMessage.addListener(event => {
            if (event.source == ConnectWindowEnum.NewSession) {
                const { tabId: sourceTabId } = event?.payload;
                if (sourceTabId != tabId) {
                    // ignore
                    return;
                }
                getSession()
            }
        })

    }, [tabId])

    const getSession = async () => {
        if (typeof sendMessage !== 'function') return;

        const session = await sendMessage({
            source: ConnectWindowEnum.GetSession,
            payload: {
                tabId
            }
        })

        if (session) {
            setSession(session as SessionPayload)
        }

    }

    return [sessionInfo]
}