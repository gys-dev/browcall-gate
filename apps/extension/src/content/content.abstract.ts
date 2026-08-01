/// <reference types="chrome"/>

import { ConnectWindowEnum, TabSession, WSPayload, CommuteEvent } from 'interfaces';
import { log, sleep } from '../common/utils';
import { getTabSession } from '../common/window-session';
import { WSSingleton } from '../common/ws-singleton';
import { StartPayload } from '../common/interface';

export abstract class ContentAppAbstract {
	protected socket!: WebSocket;
	protected observer?: MutationObserver;
	protected lastText = '';
	protected stopped = false;
	protected dom: HTMLDivElement | null = null;
	protected outputFormat = 'plain';
	protected windowSession: TabSession | null = null;
	private messageUuid?: string;

	private taskQueue: StartPayload[] = [];
	private isProcessingQueue = false;
	private currentTaskResolver: (() => void) | null = null;

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

		this.retrieveInternalTabSession();
		this.connect();
		setInterval(() => this.sendHeartbeat(), 30000);

	}

	protected sendHeartbeat() {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify({ type: "heartbeat" }));
		}
	}

	protected connect() {
		this.socket = WSSingleton.getSocket();
		WSSingleton.onOpen(() => log('WS connected'));
		WSSingleton.onError((err) => log('WS error', err));
		WSSingleton.onClose(() => {
			log('WS closed – reconnecting');
		});
		WSSingleton.onMessage((e) => {
			if (typeof e.data !== 'string') return;
			try {
				const wsPayload = JSON.parse(e.data) as WSPayload<StartPayload>;
				if (wsPayload.type === CommuteEvent.Chat && wsPayload.data) {
					this.enqueueTask(wsPayload.data);
				}
			} catch (err) {
				log('Invalid WS message', err);
			}
		});
	}

	protected enqueueTask(payload: StartPayload) {
		log("Enqueuing task:", payload.uuid);
		this.taskQueue.push(payload);
		this.processQueue();
	}

	private async processQueue() {
		if (this.isProcessingQueue) return;
		this.isProcessingQueue = true;

		while (this.taskQueue.length > 0) {
			const currentTask = this.taskQueue[0];
			this.setUUID(currentTask.uuid);
			this.lastText = '';
			this.stopped = false;

			log("Processing task from queue:", currentTask.uuid);

			// Wait until tab session is retrieved and tab is allowed to start
			let allowed = await this.allowToStart();
			while (!allowed) {
				await sleep(500);
				allowed = await this.allowToStart();
			}

			await this.occupyTab();

			await new Promise<void>((resolve) => {
				const timeoutId = setTimeout(() => {
					log("Task safety timeout reached for:", currentTask.uuid);
					this.send({ type: 'stop' });
					this.finishTask();
				}, 120000);

				this.currentTaskResolver = () => {
					clearTimeout(timeoutId);
					resolve();
				};

				this.start(currentTask).catch((err) => {
					log("Error starting task:", err);
					this.send({ type: 'stop' });
					this.finishTask();
				});
			});

			await this.releaseTab();
			this.taskQueue.shift();
		}

		this.isProcessingQueue = false;
	}

	public finishTask() {
		if (this.currentTaskResolver) {
			const resolve = this.currentTaskResolver;
			this.currentTaskResolver = null;
			resolve();
		}
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
			this.socket.send(JSON.stringify({ type: payload.type, data: { ...payload.data, uuid: this.messageUuid } }));
		}
	}

	retrieveInternalTabSession() {
		getTabSession().then((session) => {
			if (session) {
				this.windowSession = session;
				log("Retrieved tab session:", this.windowSession);
			} else {
				log("No tab session found.");
			}
		}).catch((error) => {
			log("Error retrieving tab session:", error);
		});
	}

	protected setUUID(uuid: string) {
		this.messageUuid = uuid;
	}

	protected async allowToStart() {
		if (!this.windowSession) {
			return false;
		}
		const allowToStart = await chrome.runtime.sendMessage({
			source: ConnectWindowEnum.PollingSession,
			payload: {
				socketPort: this.windowSession.socketPort,
				tabId: this.windowSession.tabId,
				uuid: this.messageUuid
			}
		});
		log("Allow to start?", allowToStart);
		return allowToStart;
	}

	protected async occupyTab() {
		if (!this.windowSession) {
			return false;
		}
		const occupy = await chrome.runtime.sendMessage({
			source: ConnectWindowEnum.Occupied,
			payload: {
				tabId: this.windowSession.tabId,
				socketPort: this.windowSession.socketPort,
				uuid: this.messageUuid
			}
		});

		return occupy;
	}

	protected async releaseTab() {
		if (!this.windowSession) {
			return false;
		}
		const release = await chrome.runtime.sendMessage({
			source: ConnectWindowEnum.Available,
			payload: {
				tabId: this.windowSession.tabId,
				socketPort: this.windowSession.socketPort,
			}
		});
		this.messageUuid = '';
		return release;
	}
}