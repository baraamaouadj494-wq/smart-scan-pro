# DocScanner AI

A legendary CamScanner-like web app with camera/upload scanning, Arabic+English OCR, AI summarization, translation (10 languages), entity extraction, document classification, chat, referral system, and crypto payments (USDT TRC-20/BTC).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at /api)
- `pnpm --filter @workspace/docscanner run dev` — run the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `GEMINI_API_KEY`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind + shadcn/ui (`@workspace/docscanner`)
- API: Express 5 (`@workspace/api-server`, port 8080)
- DB: PostgreSQL + Drizzle ORM (`@workspace/db`)
- AI: Google Gemini 2.5-flash (`@google/genai`)
- PDF: pdf-lib, QR: qrcode

## Where things live

- `lib/db/src/schema/` — DB schema (auth.ts, documents.ts — source of truth)
- `artifacts/api-server/src/routes/` — Express routes (auth, documents, folders, vocabulary, payments)
- `artifacts/docscanner/src/pages/` — React pages
- `artifacts/docscanner/src/contexts/auth-context.tsx` — auth state
- `artifacts/docscanner/src/components/` — DocumentCropper, SignaturePad, etc.

## Architecture decisions

- Auth uses email + OTP verification (6-digit code, 15-min expiry, stored in DB). In dev mode, `devCode` is returned in the API response instead of sending an actual email.
- Login accepts `email` field. Users without `emailVerified` get a 403 with `userId` to redirect to the verify step.
- All AI operations deduct from `aiAttempts` via `checkAndDeductAttempt()` in auth.ts.
- Translation results are cached in the `translationCache` JSON column per document per language.
- Documents are filtered by `userId` (session user) and `isArchived` by default.
- Shared documents are accessed via `shareToken` (random hex, publicly accessible at `/api/documents/shared/:token`).

## Product

- **Scan**: Camera or file upload → perspective correction → OCR (Arabic + English)
- **AI**: Summarize, classify, extract entities, detect books, 10-language translation, document chat
- **PDF**: Download with watermark, password encryption, page numbers, compression; merge multiple docs
- **Organize**: Folders with color picker, archive, favorites, tags, smart search
- **Share**: Generate shareable link or QR code
- **Profile**: Payment via USDT/BTC with auto-verification, referral system, personal vocabulary, usage stats, login history

## Gotchas

- `pnpm --filter @workspace/db run push` must be run after schema changes (not `migrate`)
- Don't call `pnpm dev` at workspace root — use individual workflow restarts
- Email sending is not wired up yet — OTP codes are returned as `devCode` in API responses (dev mode only)
- Wallet addresses: USDT TRC-20 = `TMDQE4bbxu2jSugbrNdUKb9jbHQUaAXreE`, BTC = `bc1qt6xwdylvj2s00ty3e8cdyug50n7etav6qywu62`

## User preferences

- Arabic-first UI for documents pages (labels in Arabic)
- All Express 5 routes use `async (req, res): Promise<void>` with early returns
- Never use `console.log` in server code — use `req.log` or the `logger` singleton
