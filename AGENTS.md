# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Yoobe Logistics Billing System — a React 19 + TypeScript SPA for logistics billing/invoice management. It uses Firebase Firestore as the backend (config hardcoded in `services/firebase.ts`) and Google Gemini AI for analysis features.

### Dev Server
- **Command**: `npm run dev` (Vite, port 8001, binds `0.0.0.0`)
- **Build**: `npm run build` (Vite production build)
- No test runner is configured (no jest/vitest/mocha). The only test-like files are utility scripts in `tests/`.

### Lint
- No ESLint or other linter is configured. TypeScript strict checking (`npx tsc --noEmit`) reports some pre-existing type errors; these do not block the Vite build.

### Environment Variables
- `GEMINI_API_KEY` in `.env.local` (see `.env.example`). The app starts and loads the login page without a real key; AI features require a valid key.
- Firebase config is hardcoded — no Firebase env vars needed.

### Authentication
- Default admin: `admin@yoobe.co` / `123` (auto-created on first run against the Firebase project).

### Key Gotchas
- `npx tsc --noEmit` will show type errors (e.g. in `GoogleDrivePicker.tsx`, `PaymentsView.tsx`). These are pre-existing and do not affect the Vite dev server or build.
- Tailwind CSS, jsPDF, and html2canvas are loaded via CDN `<script>` tags in `index.html`, not from npm.
- The app is a client-side SPA that talks directly to Firebase — there is no separate backend service to start.
