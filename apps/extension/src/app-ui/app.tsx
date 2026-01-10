import { useEffect, useState } from "react";
import { Disconnect } from "./components/Disconnect";
import { PortSettingsForm } from "./components/PortSetting";
import { ConnectWindowEnum } from "../../../../@lib/interfaces/src/events/window-events"


export function App() {

  const [isConnected, setConnect] = useState<boolean>(false);

  useEffect(() => {
    chrome.storage.sync.get('socketStatus').then(result => {
      console.log("get", result);
      setConnect(result?.socketStatus === 'connected')
    })
  }, [])


  const handleSubmit = (socketPort: number, apiPort: number) => {
    // Handle form submission logic here
    console.log("Socket Port:", socketPort);
    console.log("API Port:", apiPort);
    chrome.tabs.query(
      { active: true, currentWindow: true },
      async (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;
        setConnect(true)
       await chrome.tabs.sendMessage(tabId, {
          source: ConnectWindowEnum.SetPorts,
          payload: {
            tabId,
            socketPort,
            apiPort
          }
        });
      }
    );
  }

  const disconnect = () => {
    setConnect(false)
    chrome.tabs.query(
      { active: true, currentWindow: true },
      (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;
        chrome.tabs.sendMessage(tabId, {
          source: ConnectWindowEnum.Disconnect,
          payload: {
          }
        });
      }
    );
  }


  return (
    <div className=" bg-gray-200 p-4 rounded-md">

      <h1 className="text-lg font-medium">App name</h1>
      {isConnected ? <Disconnect onDisconnect={disconnect} /> : <PortSettingsForm onSubmit={handleSubmit} />}
    </div>
  );
}

export default App;
