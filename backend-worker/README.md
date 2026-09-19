# Folio backend Worker

This Cloudflare Worker is a production backend alternative to the local FastAPI service. It implements Folio's authentication, books, chapters, feed publication, and automatic character tracking endpoints.

## Configure and deploy

```sh
cd backend-worker
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

For production, add these secrets interactively (never commit them):

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

Set `FRONTEND_URL` in `wrangler.jsonc` to the deployed frontend origin before deploying. Then set `VITE_API_URL` in the frontend build environment to the Worker URL, for example `https://folio-api.<your-subdomain>.workers.dev`.

The Worker retains Supabase secrets server-side and validates each user token before accessing data.
