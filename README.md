# FinTrack

A personal finance tracker that connects to real bank accounts through Plaid, pulls transactions, and breaks down spending by category.

**Stack:** React (Vite) · Node.js / Express · Plaid API

## How it works

1. The React app asks the server for a short-lived `link_token`.
2. The user opens Plaid Link and logs into their bank. Plaid returns a one-time `public_token`.
3. The server exchanges the `public_token` for a permanent `access_token`. The access token is kept server-side and never sent to the browser.
4. The server calls `/transactions/sync` using a cursor, so later syncs fetch only what changed.

## Run locally

1. Create a free account at https://dashboard.plaid.com and copy your sandbox keys.
2. Start the server:
   ```bash
   cd server
   cp .env.example .env   # paste your keys into .env
   npm install
   npm run dev
   ```
3. In a second terminal, start the client:
   ```bash
   cd client
   npm install
   npm run dev
   ```
4. Open http://localhost:5173, click **Connect a bank**, pick any bank, and log in with the sandbox credentials `user_good` / `pass_good`.

## Roadmap

- [x] Plaid Link and transaction sync
- [ ] MongoDB persistence and user accounts
- [ ] Monthly trend charts and budget limits
- [ ] AI spending insights
- [ ] Deploy (Vercel + Render)
