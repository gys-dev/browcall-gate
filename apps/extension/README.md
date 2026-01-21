# Browcall Extension

The Browcall Extension is a key component of the GPT Inner Call project. It serves as a bridge between your browser and the Browcall API, allowing for automated interactions with AI chat platforms like ChatGPT and Perplexity.

## 🚀 Features

- **Platform Support**: Works seamlessly with ChatGPT and Perplexity.
- **Bi-directional Communication**: Receives commands from the backend API and sends back responses from the AI chat interface.
- **Manifest V3**: Built using the latest Chrome Extension standards.
- **React-based UI**: A modern popup interface for managing settings and status.

## 🛠 Installation

### 1. Build the Extension
Since this is a monorepo, you should build the extension from the root directory:

```bash
# From the project root
npm run build-extension-react
# or
yarn build-extension-react
```

This command executes `nx build-all extension`, which builds the React app, background scripts, and injection logic.

### 2. Load into Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the `dist/apps/extension` folder from the project root.

## 🏃 Running in Development

### Watch Mode
To automatically rebuild the extension whenever you make changes to the source code, run the following from the root directory:

```bash
npm run watch-extension-build
# or
yarn watch-extension-build
```

This will watch the `apps/extension/src` directory and trigger a rebuild on every change. After a build, you may need to click the 'Refresh' icon on the extension card in `chrome://extensions/`.

## 📁 Structure

- `src/app-ui`: The React-based popup interface.
- `src/background`: Background service workers handling communication.
- `src/inject`: Scripts injected into ChatGPT/Perplexity pages to automate interactions.
- `manifest.json`: Extension configuration and permissions.

## 🔧 Configuration

Ensure your `.env` file in the root or `apps/extension/.env` is correctly configured if specialized API endpoints are needed.
