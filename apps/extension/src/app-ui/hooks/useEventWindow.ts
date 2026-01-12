import { useCallback, useEffect, useMemo, useState } from "react"

export function useEventWindow() {
    const [tabId, setTabId] = useState<number>();

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true })
            .then((tabs) => {
                const tabId = tabs[0]?.id;
                if (tabId) {
                    setTabId(tabId);
                }
            })
            .catch(error => {
                console.log("get tab fail", error)
            })
    }, [])

    const sendMessage = useCallback(
        async <T,>(payload: any): Promise<T> => {
            if (typeof tabId !== 'number') {
                throw new Error('tabId not detected')
            }

            return chrome.runtime.sendMessage({
                source: payload.source,
                payload: {
                    ...payload,
                    tabId
                }
            }) as Promise<T>
        },
        [tabId]
    )

    return [
        tabId,
        sendMessage
    ]
}