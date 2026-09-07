# Billing Yoobe — Claude Context

## Projeto

Sistema de faturamento logístico para a Yoobe. Dashboard React com Firebase Firestore, integração Gemini AI para análise de faturas. Deploy via Vercel + Firebase.

Repo: `genautech/billing`

## Stack

- **Framework**: React + Vite, TypeScript
- **UI**: Recharts (gráficos), React DOM
- **Backend/DB**: Firebase Firestore + Firebase Storage
- **AI**: `@google/genai` (Gemini)
- **Deploy**: Vercel + Cloud Build (GCP `crypto-quasar-327717`)
- **Package manager**: npm

## Comandos

```bash
npm run dev       # http://localhost:3010
npm run build
npm run preview
```

## Variáveis de ambiente

```
GEMINI_API_KEY
API_KEY          # Firebase API key
```

## Estrutura

```
index.tsx         # entry point
App.tsx           # root component
components/       # UI components
contexts/         # React contexts
services/         # Firebase + AI services
scripts/          # utilitários
tests/            # testes
types.ts          # tipos globais
```

## Deploy

- `cloudbuild.yaml` — Cloud Build no GCP
- `Dockerfile` + `nginx.conf` — container de produção
- `firebase.json` + `firestore.rules` — config Firebase

## Gotchas

- Port padrão: **3010** (não 3000)
- Firebase rules em `firestore.rules` e `storage.rules` — alterar com cuidado
- Cloud Build configurado no GCP project `crypto-quasar-327717`
