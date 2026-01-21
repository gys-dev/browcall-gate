# GPT Inner Call (Browcall)

<p align="center">
  <img src="https://img.shields.io/badge/Nx-143059?style=for-the-badge&logo=nx&logoColor=white" alt="Nx" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/n8n-FF6D5A?style=for-the-badge&logo=n8n&logoColor=white" alt="n8n" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License" />
</p>

GPT Inner Call is a monorepo project designed to bridge the gap between AI chat interfaces (like ChatGPT and Perplexity) and automated workflows. It provides a way to "call" these AI models internally by automating their web interfaces through a dedicated browser extension.



<p align="center">
  <img src="resource/run.gif" alt="Browcall Demo">
</p>

## 🚀 Key Components

The project is organized as a monorepo using [Nx](https://nx.dev/):

### 🧩 Apps
- **[Browcall Extension](./apps/extension)**: A browser extension (Manifest V3) that injects logic into AI chat platforms (ChatGPT, Perplexity) to facilitate automated interactions.
- **[GPT Auto API](./apps/gpt-auto-api)**: A Node.js backend server that exposes an OpenAI-compatible `/v1/chat/completions` endpoint. It communicates with the browser extension to execute requests and retrieve responses.

### 📦 Packages
- **[n8n-nodes-browcall-gate](https://github.com/gys-dev/n8n-nodes-browcall-gate)**: Custom n8n nodes to integrate Browcall directly into your automation workflows.
- **[Interfaces](./packages/interfaces)**: Shared TypeScript definitions and interfaces used across the monorepo.

## 🛠 Tech Stack

- **Monorepo Management**: [Nx](https://nx.dev/)
- **Backend**: Node.js, Express, WebSocket (`ws`)
- **Frontend/Extension**: React, TypeScript, Vite
- **Integration**: n8n

## 🎬 Getting Started

### Prerequisites

- Node.js (v18+)
- Yarn or npm
- Google Chrome or Chromium-based browser (for the extension)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/gpt-inner-call.git
    cd gpt-inner-call
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

### Development

#### Running the API
To start the backend API in development mode:
```bash
npm run serve
```
The server will run at `http://localhost:8766`.

#### Building the Extension
To build the browser extension:
```bash
npm run build-extension-react
```
The build artifacts will be in `dist/apps/extension`. You can load this directory as an "Unpacked Extension" in Chrome.

#### Working with n8n Nodes
To build and integrate the n8n nodes:
```bash
npm run add-n8n-node
```

## 📖 API Documentation

The `gpt-auto-api` follows the OpenAI API specification.

### Chat Completions
- **Endpoint**: `POST /v1/chat/completions`
- **Description**: Forwards the chat request to the active browser session via the extension.

## 🤝 Contributing

1. Follow the [Knowns Guidelines](./AGENTS.md).
2. Ensure linting passes: `npm run lint`.
3. Test your changes: `npm run test`.

## 📄 License

This project is licensed under the MIT License.
