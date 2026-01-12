import { useEffect, useState } from "react";
import { Disconnect } from "./components/Disconnect";
import { PortSettingsForm } from "./components/PortSetting";
import { ConnectWindowEnum } from "interfaces"
import { useSession } from "./hooks/useSession";
import { useEventWindow } from "./hooks/useEventWindow";


export function App() {

  const [session] = useSession();
  const [tabId, sendMessage] = useEventWindow()




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


  return (
    <div className=" bg-gray-200 p-4 rounded-md">

      <h1 className="text-lg font-medium">App name</h1>
      {session ? <Disconnect session={session} onDisconnect={disconnect} /> : <PortSettingsForm onSubmit={handleSubmit} />}
    </div>
  );
}

export default App;
