# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Yoobe Logistics Billing System — a React 19 + TypeScript + Vite frontend-only SPA for logistics billing and invoice management. Uses Firebase Firestore as backend (config hardcoded in `services/firebase.ts`) and optionally Google Gemini AI for analysis features.

### Dev server

- `npm run dev` starts Vite on port **8001** (bound to `0.0.0.0`).
- Firebase credentials are hardcoded, so the app connects to the live `yoobe-billing-app` Firestore project without local emulator setup.
- Default admin login: `admin@yoobe.co` / `123` (see README).

### Build / Lint / Test

- **Build:** `npm run build` — Vite production build (outputs to `dist/`). Chunks are split into vendor, firebase, and charts.
- **Lint:** `npm run lint` — ESLint with typescript-eslint. Pre-existing warnings/errors exist in the codebase; they do not block the build.
- **Type-check:** `npm run typecheck` — runs `tsc --noEmit`. A few pre-existing TS errors exist but do not block Vite builds.
- **Test:** No test framework is configured. There are no automated tests.

### Environment variables

- `GEMINI_API_KEY` — optional; enables AI analysis features. Set in `.env.local` (see `.env.example`).
- `VITE_FIREBASE_*` — Firebase config via env vars with hardcoded fallbacks in `services/firebase.ts`. Set in `.env.local` to override defaults.

### Gotchas

- The `tsconfig.json` uses `"allowImportingTsExtensions": true` with `"noEmit": true`, so `tsc` is only for checking, not compilation. Vite handles all bundling.
- TailwindCSS is loaded via CDN (`<script>` tag in `index.html`), not installed as a dependency.
- jsPDF and html2canvas are also loaded via CDN script tags.
