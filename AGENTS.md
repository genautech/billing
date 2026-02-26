# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Yoobe Logistics Billing System — a React 19 + TypeScript + Vite frontend-only SPA for logistics billing and invoice management. Uses Firebase Firestore as backend (config hardcoded in `services/firebase.ts`) and optionally Google Gemini AI for analysis features.

### Dev server

- `npm run dev` starts Vite on port **8001** (bound to `0.0.0.0`).
- Firebase credentials are hardcoded, so the app connects to the live `yoobe-billing-app` Firestore project without local emulator setup.
- Default admin login: `admin@yoobe.co` / `123` (see README).

### Build / Lint / Test

- **Build:** `npm run build` — Vite production build (outputs to `dist/`).
- **Lint:** No ESLint or Prettier is configured in this repo. Use `npx tsc --noEmit` for type-checking; note there are pre-existing TS errors that do not block the Vite build.
- **Test:** No test framework is configured. There are no automated tests.

### Environment variables

- `GEMINI_API_KEY` — optional; enables AI analysis features. Set in `.env.local` (see `.env.example`).
- Firebase config is **not** via env vars; it is hardcoded in `services/firebase.ts`.

### Gotchas

- The `tsconfig.json` uses `"allowImportingTsExtensions": true` with `"noEmit": true`, so `tsc` is only for checking, not compilation. Vite handles all bundling.
- TailwindCSS is loaded via CDN (`<script>` tag in `index.html`), not installed as a dependency.
- jsPDF and html2canvas are also loaded via CDN script tags.
