---
id: s326ku
title: Project structure
status: todo
priority: medium
labels: []
createdAt: '2026-01-12T14:02:29.177Z'
updatedAt: '2026-01-12T14:02:29.177Z'
timeSpent: 0
---
# Project structure

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This project is structured as a monorepo containing several distinct applications and shared libraries.

- **`.knowns/`**: Stores internal knowledge and task-related documentation for the agent.
- **`@lib/interfaces/`**: Contains shared TypeScript interfaces and common utilities used across different applications (e.g., event definitions).
- **`apps/`**: Houses the primary applications within the project.
    - **`apps/extension/`**: The browser extension frontend application, built with React and Vite. It includes the background script, content scripts, and the user interface.
    - **`apps/gpt-auto-api/`**: The backend API application, likely built with Node.js, responsible for handling GPT-related interactions and business logic.
- **`packages/n8n-nodes-browcall-gate/`**: A custom n8n (workflow automation tool) node package, designed for specific integrations or functionalities within n8n workflows.
<!-- SECTION:DESCRIPTION:END -->

