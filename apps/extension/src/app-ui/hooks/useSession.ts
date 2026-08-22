import { useEffect, useState } from "react";
import { useEventWindow } from "./useEventWindow"
import { ConnectWindowEnum } from "interfaces/src";
import { SessionPayload } from "../../common/interface";
import { log } from "../../common/utils";

export function useSession() {
    const [tabId, sendMessage] = useEventWindow()
    const [sessionInfo, setSession] = useState<SessionPayload | null>(null)

    useEffect(() => {
        if (typeof tabId !== 'number') {
            setSession(null)
            return
        }

        getSession()

        const handleMessage = (event: any) => {
            const sourceTabId = event?.payload?.tabId;
            if (sourceTabId !== tabId) {
                return
            }

            if (event.source === ConnectWindowEnum.Disconnected) {
                log("Disconnect")
                setSession(null)
            }

            if (event.source === ConnectWindowEnum.NewSession) {
                getSession()
            }
        }

        chrome.runtime.onMessage.addListener(handleMessage)
        return () => chrome.runtime.onMessage.removeListener(handleMessage)
    }, [tabId])

    const getSession = async () => {
        if (typeof sendMessage !== 'function') return;

        const session = await sendMessage({
            source: ConnectWindowEnum.GetSession,
            payload: {
                tabId
            }
        })

        setSession((session as SessionPayload | null) || null)

    }

    return [sessionInfo]
}