# Tour Guide System

A tour guide system that narrates the history of monuments around you. Based on your location and giving you the ability to create your ownn custom routes

Built with Vue 3, OpenLayers, WebSockets, Wikidata, Ollama LLM, and Kokoro TTS.

---

## What it does

- Shows monuments near you on an interactive map, pulled live from Wikidata
- Automatically narrates monuments when you walk within 100m of them
- AI-generated narration using a local LLM (Ollama) + text-to-speech (Kokoro)
- Background music to fill in silence
- Create and save custom walking routes through monuments
- Works as a PWA — installable on your phone
- RSS feed of saved routes at `/feed.xml`


---

## Requirements

- Node.js >= 20
- pnpm (frontend)
- Python 3.9+ with pip (TTS server)
- [Ollama](https://ollama.com) running locally with `llama3.2:3b`

---

## Setup

sidenote: this project consists of 2 parts, the frontend and the backend, in the way I did it both need to be hosted separately. in the same host as the backend you also need to have ollama installed and running. 

### 1. Clone and install

```bash
# Frontend
cd frontend
pnpm install

# Backend
cd ../backend
npm install
pip install kokoro-onnx soundfile flask
```

### 2. Pull the Ollama model

```bash
ollama pull llama3.2:3b
```

### 3. Start everything

**Backend WebSocket server:**
```bash
cd backend
npm start
```

**TTS server :**
```bash
cd backend
python tts_server.py
```

**Frontend dev server:**
```bash
cd frontend
pnpm dev
```

**Backend** — run on any Node.js host:
```bash
cd backend
node server.js
```

The TTS server and Ollama need to run on the same machine as the backend since they communicate over localhost.

---

## RSS feed

Saved routes are available as an RSS feed at:
```
GET /feed.xml
```

Each route is an RSS item with its name, stop count, and the list of monuments.

---

## Tech stack

| Part               | Tech                      |
| ------------------ | ------------------------- |
| Frontend framework | Vue 3 (Composition API)   |
| Maps               | OpenLayers                |
| Animations         | GSAP                      |
| PWA                | vite-plugin-pwa + Workbox |
| Build tool         | Vite                      |
| Backend            | Node.js                   |
| Real-time          | WebSocket                 |
| Database           | SQLite (`better-sqlite3`) |
| Monument data      | Wikidata SPARQL           |
| Route planning     | OSRM                      |
| LLM narration      | Ollama (`llama3.2:3b`)    |
| Text-to-speech     | Kokoro ONNX               |
| Hosting (frontend) | Railway                   |
| Hosting (backend)  | Cloudflare Tunnel         |

