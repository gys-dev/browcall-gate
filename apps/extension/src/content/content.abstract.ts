/// <reference types="chrome"/>

import { WSPayload } from 'interfaces';
import { log } from '../common/utils';

export abstract class ContentAppAbstract {
	protected socket!: WebSocket;
	protected observer?: MutationObserver;
	protected lastText = '';
	protected stopped = false;
	protected dom: HTMLDivElement | null = null;
	protected outputFormat = 'plain';

	/**
	 * Return selectors for the app
	 */
	abstract getSelectors(): Record<string, string>;

	/**
	 * Extract response text and citations from DOM
	 */
	abstract extractResponseText(): Promise<{ text: string; citations: any[] }>;

	/**
	 * Check if response is complete
	 */
	abstract isResponseComplete(): boolean;

	/**
	 * Set mode (e.g., Search, Research, Labs)
	 */
	abstract setMode(mode: any): Promise<void>;

	/**
	 * Main entry point for sending a prompt
	 */
	abstract start(payload: any): Promise<void>;

	init() {
		log("Initializing ContentApp...");
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => this.setupUI());
		} else {
			this.setupUI();
		}
	}

	protected updateStatus(message: string, color: string) {
		if (this.dom) {
			this.dom.innerHTML = `<div style="color: ${color};">${message}</div>`;
		}
	}

	protected setupUI() {
		log("Setting up ContentApp UI...");
		// inject style
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.type = 'text/css';
		link.href = window.chrome.runtime.getURL('./assets/inject-style.css'); // Get the full URL to the extension resource
		log("Injecting stylesheet:", link);
		document.head.appendChild(link);


		// inject status DOM
		const insertedDom = document.createElement('div');
		insertedDom.id = 'contentAppStatus';
		insertedDom.innerHTML = `
			<div>
				<table>
					<tr>
						<td class="col-width head-cell">Port:</td>
						<td id="portValue">0</td>
					</tr>
					<tr>
						<td class="col-width head-cell">Socket:</td>
						<td id="sockValue"> 0</td>
					</tr>
					<tr>
						<td class="col-width head-cell">Status:</td>
						<td id="statusColumn">N/A</td>
					</tr>
				</table>

				<div class="tool-message">
					<p class="tool-message__text">This tab is occupied by tool</p>
				</div>

			</div>
			
		`;
		document.body.appendChild(insertedDom);

		this.connect();
		setInterval(() => this.sendHeartbeat(), 30000);

	}

	protected sendHeartbeat() {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify({ type: "heartbeat" }));
		}
	}

	protected connect() {
		// To be called by subclass, should set up socket event handlers
		// Example: this.socket = ...
	}

	protected observe(mutationCallback: (a: MutationRecord[], b: MutationObserver) => void) {
		this.observer?.disconnect();
		this.observer = new MutationObserver(mutationCallback);
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
		});
	}

	protected send<T>(payload: WSPayload<T>) {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(payload));
		}
	}
}