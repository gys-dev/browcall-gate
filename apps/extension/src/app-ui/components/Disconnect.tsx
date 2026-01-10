import React from "react"


interface DisconnectProps {
    onDisconnect: () => void
}

export const Disconnect: React.FC<DisconnectProps> = ({
    onDisconnect
}) => {

    return (
        <div className=" bg-slate-100 rounded-md border-l-4 my-2 border-l-blue-600 p-2">
            <div className="ml-2">
                <div className="flex flex-row align-middle mb-2 mr-2 text-md">
                    <div className="inline-block w-40" >
                        <b>TabID:</b>
                    </div>
                    <div className="inline-block" >
                        <p>abccksjshhjaiwiwiwi</p>
                    </div>
                </div>

                <div className="flex flex-row align-middle mb-2 mr-2 text-md">
                    <div className="inline-block w-40" >
                        <b>TabID:</b>
                    </div>
                    <div className="inline-block" >
                        <p>abccksjshhjaiwiwiwi</p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onDisconnect}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    Disconnect
                </button>
            </div>
        </div>
    )
}