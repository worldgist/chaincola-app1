# chaincola-app1

Monorepo for the **ChainCola** stack:

| Package | Role |
|--------|------|
| **`chaincola-web`** | Next.js (App Router) web app — deploy on [Vercel](https://vercel.com) |
| **`chaincola`** | Expo / React Native mobile app |
| **`chaincola-transfer`** | Express service for Flutterwave transfers (`api.chaincola.com` pattern) |

**Live (web):** [chaincola-app1.vercel.app](https://chaincola-app1.vercel.app)

---

## Development

```bash
# Web app
cd chaincola-web
cp .env.example .env.local   # add Supabase URL + anon key
npm install
npm run dev
```

```bash
# Production build (same as Vercel)
cd chaincola-web
npm run build
```

### Vercel

1. Import this repo; set **Root Directory** to `chaincola-web` if the repo root is the monorepo.
2. Add **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (see `chaincola-web/.env.example`).
3. Deploy (`vercel` CLI from `chaincola-web` or Git push).

---

## Tech stack

- **Web:** Next.js 16+, TypeScript, Tailwind  
- **Mobile:** Expo  
- **Data / auth:** Supabase  
- **Fiat payouts:** Flutterwave (via Edge Functions + `chaincola-transfer`)

---

## Cursor / AI notes

- **`useSearchParams`** in App Router client pages must sit under a **`<Suspense>`** boundary (see `buy-crypto`, `send-crypto`, `profile/verify`).
- Treasury NGN ledger + wallet admin live under **`/admin/wallet-management`** (admin session required).
