import React from "react";
import unsupportedImg from "../../assets/access-denied.png";

export const UnSupportPage: React.FC<{}> = ({ }) => {
    const handleGoBack = () => {
        window.history.back();
    };

    return (
        <div className="min-w-[300px] flex flex-col items-center">
            <img className="w-20 h-20" src={unsupportedImg} alt="Unsupported Page" />
            <p className="text-center mt-4 text-xs text-gray-600 font-medium">This website is currently not supported by Browcall. We are constantly expanding our compatibility to more domains.</p>
        </div>
    );
};