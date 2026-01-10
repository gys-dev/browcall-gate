import React, { FC, useState } from "react";


interface PortSettingsFormProps {
    onSubmit?: (socketPort: number, apiPort: number) => void;
}

export const PortSettingsForm: React.FC<PortSettingsFormProps> = ({
    onSubmit
}) => {

    const handleSubmit = () => {
        const socketPortInput = document.getElementById('firstInput') as HTMLInputElement;
        const apiPortInput = document.getElementById('secondInput') as HTMLInputElement;
        const socketPort = parseInt(socketPortInput.value, 10);
        const apiPort = parseInt(apiPortInput.value, 10);
        if (onSubmit) {
            onSubmit(socketPort, apiPort);
        }
    }

    return (
        <div className="bg-slate-100 rounded-md border-l-4 my-2 border-l-blue-600 p-2">
            <div className="mt-6 flex items-center gap-3 ">
                <div className="form-group">
                    <label htmlFor="firstInput" className='text-sm'>Socket Port</label>
                    <input
                        id="firstInput"
                        type="number"
                        placeholder="Socket Port"
                        className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="secondInput" className='text-sm'>API Port</label>
                    <input
                        id="secondInput"
                        type="number"
                        placeholder="API Port"
                        className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                    />
                </div>
            </div>
            <div className="mt-4 flex items-center">
                <button
                    type="button"
                    onClick={handleSubmit}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    Pin Tab
                </button>
            </div>
        </div>
    );
}