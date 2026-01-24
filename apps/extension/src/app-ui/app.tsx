import { useEffect, useState } from "react";
import { Disconnect } from "./components/Disconnect";
import { PortSettingsForm } from "./components/PortSetting";
import { ConnectWindowEnum } from "interfaces"
import { useSession } from "./hooks/useSession";
import { useEventWindow } from "./hooks/useEventWindow";
import { UnSupportPage } from "./components/UnsuportPage";
import { getApp } from "../common/utils";


export function App() {

  const [session] = useSession();
  const [tabId, sendMessage] = useEventWindow();
  const [isUnsupportPage, setUnsupportPage] = useState(false);



  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const hostname = new URL(tabs[0].url!).hostname
      setUnsupportPage(!getApp(hostname))
    })
  }, [])

  const handleSubmit = (socketPort: number, apiPort: number) => {
    // Handle form submission logic here
    if (!tabId) return;

    chrome.tabs.sendMessage(tabId as number, {
      source: ConnectWindowEnum.SetPorts,
      payload: {
        tabId,
        socketPort,
        apiPort
      }
    });
  }

  const disconnect = () => {
    if (typeof sendMessage !== 'function') return;
    sendMessage({ source: ConnectWindowEnum.Disconnect })
  }

  if (isUnsupportPage) {
    return (
      <div className=" bg-gray-200 p-4 rounded-md">
        <UnSupportPage />
      </div>
    )
  }


  return (
    <div className=" bg-gray-200 p-4 rounded-md">
      <h1 className="text-lg font-medium">Browcall</h1>
      {session ? <Disconnect session={session} onDisconnect={disconnect} /> : <PortSettingsForm onSubmit={handleSubmit} />}
    </div>
  );
}

export default App;
