# AGENTS.md — Billing Yoobe

Sistema de faturamento logístico. Dashboard React + Firebase + Gemini AI.

Repo: `genautech/billing`

## Stack

React · Vite · TypeScript · Firebase Firestore · Recharts · @google/genai (Gemini)

## Dev

```bash
npm run dev     # http://localhost:3010
npm run build
```

## Estrutura

```
App.tsx / index.tsx   # entrada
components/           # UI
contexts/             # estado React
services/             # Firebase + Gemini
types.ts              # tipos
```

## Regras

- Firebase rules (`firestore.rules`, `storage.rules`) — alterar com cuidado
- Port: 3010
- Deploy via Cloud Build (GCP `crypto-quasar-327717`)
