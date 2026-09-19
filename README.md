# Folio

Folio is a focused workspace for drafting books, organizing manuscripts, and collecting peer feedback.

## Supabase + Google sign-in

1. Create a Supabase project and run [supabase/schema.sql](./supabase/schema.sql) in its SQL Editor.
2. In Supabase Auth, enable the Google provider and add `http://127.0.0.1:5173/auth/callback` and `http://localhost:5173/auth/callback` to the allowed redirect URLs.
3. In Google Cloud, add the same local URLs under Authorized JavaScript origins and use the Supabase callback URL shown in the Google provider settings as an authorized redirect URI.
4. Copy `backend/.env.example` to `backend/.env`, then supply your project URL and **service-role key**. Do not put Supabase credentials in the frontend.

The client talks only to FastAPI. FastAPI owns the Supabase integration and no sample books, characters, scenes, or reviews are seeded.

## Run locally

```sh
cd frontend && npm install && npm run dev
```

The FastAPI service is separate:

```sh
docker compose up -d
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://localhost:5173`. The interface begins at `/books`; visit `/review/7F3ADQ` to see the standalone reviewer reading experience.
