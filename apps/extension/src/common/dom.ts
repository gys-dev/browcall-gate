import { ConnectState } from "./interface";

export function showOverlay(showStatus: boolean) {
    const overlay = document.getElementById('contentAppStatus');

    if (!overlay) {
        console.warn('[contentAppStatus] Overlay not found');
        return;
    }

    if (showStatus) {
        overlay.style.display = 'block';
        overlay.setAttribute('aria-hidden', 'false');
    } else {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
    }
}

export function updateCellValue(
    container: HTMLElement,
    id: string,
    value: string | number
) {
    const el = container.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;

    el.textContent = String(value);
}

export function updateStatus(
    container: HTMLElement,
    port: number,
    socket: number,
    status: ConnectState
) {
    switch(status) {
        case 'connected':
            container.style.borderColor = "#008236"
            break
        case 'error':
            container.style.borderColor = "#e7000b"
            break;
        default:
            container.style.borderColor = "#4a5565"
    }
    updateCellValue(container, 'portValue', port);
    updateCellValue(container, 'sockValue', socket);
    updateCellValue(container, 'statusColumn', status);
}
