# NexisFlow - Autonomous AI-Run Company Desktop Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-44.x-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3-38B2AC.svg)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57.svg)](https://github.com/WiseLibs/better-sqlite3)

**NexisFlow** is an autonomous AI company orchestrator packaged as a cross-platform desktop application. Give NexisFlow a business mission—whether building software, orchestrating an outreach campaign, or conducting market research—and an autonomous **CEO agent** will assess the objective, establish dedicated **department pods** (Engineering, Marketing, Sales, Operations), hire and dispatch specialist workers, and review finished deliverables until the goal is achieved.

---

## 🌟 Key Features

### 1. 🏢 Dynamic Department Formation & Pods
- **Demand-Driven Hierarchy**: The CEO analyzes your goal and dynamically establishes relevant departments (e.g., *Engineering*, *Marketing & Growth*, *Outreach & Sales*, *Operations*).
- **Leadership & Specialists**: Appoints Department Heads (CTO, CMO, VP Sales) and recruits specialist agents reporting to leads or directly to the CEO.
- **Agent Lifecycle Management**: Inspects existing roster before recruiting. Users can dismiss or delete any sub-agent at any time with active tasks automatically unassigned (the CEO is permanently protected).
- **Visual Org Chart**: Interactive tree displaying the CEO, department pods with accent banners, reporting lines, model tags, and live execution status.

### 2. 📋 Kanban Task Board & Detailed Modal
- **Persistent SQLite State**: Tasks track through `todo`, `in_progress`, `in_review`, `completed`, and `failed` states.
- **Detailed Task Modal**: Click any task card to open a full inspector showing:
  - Task title, status badge, and retry counters.
  - Assigned specialist agent.
  - Detailed requirements & acceptance criteria.
  - CEO review feedback (if revisions were requested).
  - Produced deliverable output preview with a 1-click **Copy Result** button.
  - Dependencies and task deletion controls.
- **Autonomous Review Loop**: CEO inspects deliverables via `review_result(accept | reject + feedback)` with automatic retries.

### 3. 📁 Sandboxed Workspace & Deliverables
- **Native File Explorer Integration**: Choose your root storage directory on first launch. Open company folders and deliverables in Windows File Explorer with one click.
- **Structured Storage**:
  - `/<company>/deliverables/`: Finished strategies, copy, reports, and code produced by workers.
  - `/<company>/notes/`: Strategic CEO memory, sprint notes, and roadmaps.
- **In-App Markdown Viewer**: Render, read, and copy generated deliverables directly within the application.

### 4. 🧠 Multi-Provider & Hybrid Local LLM Support
- **OpenRouter (200+ Models)**: Direct access to DeepSeek R1, DeepSeek V3, Claude 3.5 Sonnet, Llama 3.3, Qwen 2.5 Coder, and more.
- **Google Gemini**: Gemini 2.0 Flash, Gemini 1.5 Flash, Gemini 1.5 Pro.
- **OpenAI & Anthropic**: GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet, Claude 3.5 Haiku.
- **Local Ollama (Zero Cost & Private)**: Automatically scans `localhost:11434` for locally installed models.
- **Independent Model Configuration**: Assign different models to the CEO (e.g., Claude 3.5 Sonnet or Gemini 2.0 Flash for strategic planning) and worker agents (e.g., DeepSeek V3 or local Ollama for cost efficiency).
- **Custom Model IDs**: Easily input any custom model ID or OpenAI-compatible endpoint.

### 5. 📜 Dedicated Execution Logs & Agent Filtering
- **Always Accessible**: Access logs at any time via the sidebar, dashboard, or directly from the Org Chart.
- **Live Stream & Historical Replay**: Follow active agent execution in real-time or inspect transcripts from past runs.
- **Agent Filters**: Filter logs by **All Agents**, **👑 CEO**, or any individual specialist worker.
- **Event Filtering & Search**: Isolate LLM messages, tool invocations, or errors with full-text search.

### 6. 🛡️ Human-In-The-Loop & Guardrails
- **Emergency Abort**: 1-click **Stop Button** aborts all running agents immediately via `AbortController`.
- **Budget Protection**: Configurable monthly and per-run spending caps. Spend gauges track expenses in real-time.
- **Approvals Inbox**: Hiring thresholds or sensitive tool executions pause execution and await user confirmation.
- **CEO Direct Chat**: Open the CEO drawer at any time during or between runs to ask questions or steer company strategy.

### 7. 🔒 Hardware-Grade Security
- API keys are encrypted at rest using Electron's native `safeStorage` (Windows DPAPI, macOS Keychain, Linux Secret Service).
- Zero exposure: API keys are strictly confined to the Node.js Main process and are never accessible to the browser renderer.

---

## 🏗️ Architecture

```
nexisflow/
├── src/
│   ├── main/                    # Electron Main Process (Node.js)
│   │   ├── agents/              # Autonomous Agent Loops, Orchestrator, Tools
│   │   │   ├── tools/           # CEO tools (setup_department, hire_agent, create_task, etc.)
│   │   │   │                    # Worker tools (read_file, write_file, web_search, etc.)
│   │   │   ├── orchestrator.ts  # Goal execution loop & tool dispatcher
│   │   │   └── agentLoop.ts     # Multi-turn LLM loop using Vercel AI SDK
│   │   ├── db/                  # SQLite schema & database manager (better-sqlite3)
│   │   ├── ipc/                 # IPC handlers & secure router
│   │   ├── providers/           # Model adapters (OpenRouter, Google, OpenAI, Claude, Ollama)
│   │   ├── security/            # safeStorage key encryption & budget guards
│   │   └── workspace/           # Sandboxed file management & OS shell integration
│   ├── preload/                 # Secure contextBridge IPC bridge
│   ├── renderer/                # React 19 + Vite + Tailwind CSS Desktop UI
│   │   └── src/
│   │       ├── components/
│   │       │   ├── dashboard/   # OrgChart, TaskBoard, ExecutionLogsView, CompanyDashboard
│   │       │   ├── deliverables/# DeliverablesView markdown previewer
│   │       │   ├── run/         # RunStreamModal live execution view
│   │       │   └── settings/    # API keys, Ollama management, Workspace folder
│   │       └── App.tsx          # Main application container
│   └── shared/                  # Typed interfaces, IPC channels, rate cards, constants
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20.x or v22+ (tested on Node v24.x)
- **npm**: v10+
- **C++ Build Tools** (required for compiling native `better-sqlite3` bindings):
  - **Windows**: `npm install --global --production windows-build-tools` or Visual Studio C++ build tools.
  - **macOS**: `xcode-select --install`
  - **Linux**: `sudo apt-get install build-essential python3`

### 1. Clone the Repository
```bash
git clone https://github.com/rachitmath/NexisFlow.git
cd NexisFlow
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Rebuild Native Modules (if required)
```bash
npm run rebuild
```

### 4. Run Automated Tests
```bash
npm test
```

### 5. Build Application
```bash
npm run build
```

### 6. Launch in Development Mode
```bash
# In Terminal 1: Start Vite frontend server
npm run dev

# In Terminal 2: Launch Electron desktop window
npm start
```
*(Alternatively, you can run `npm run dev:electron`)*

---

## 📦 Packaging & Distribution

Create standalone distributables for your operating system:

```bash
# Windows (.exe installer)
npm run package:win

# macOS (.dmg / .app)
npm run package:mac

# Linux (.AppImage / .deb)
npm run package:linux
```

Packaged installers will be generated inside the `release/` directory.

---

## ⚙️ Configuration & Environment

1. On launch, select a local folder on your computer for workspace storage (all created files, deliverables, and notes will be saved there).
2. Open **Settings** (gear icon in the bottom-left sidebar) to configure your AI providers:
   - **OpenRouter**: Enter your API key (`sk-or-v1-...`) for access to 200+ models.
   - **Google Gemini**: Enter your Google AI Studio API key.
   - **OpenAI**: Enter your OpenAI API key.
   - **Anthropic**: Enter your Claude API key.
   - **Ollama**: Automatically detected at `http://localhost:11434`.

---

## 🧪 Testing

NexisFlow includes unit and integration tests covering the SQLite database schema, department management, hierarchy queries, agent dispatch, and resilient lookups:

```bash
npm test
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
