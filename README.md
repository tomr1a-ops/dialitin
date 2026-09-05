# DialItIn

Upload a full swing. Get the #1 thing holding you back — and exactly how to fix it.

**Design document:** [`docs/DialItIn_Design_Rev25.docx`](docs/DialItIn_Design_Rev25.docx) (replaces SwingRead_Design_Rev22 / Rev20).

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with your Supabase Project URL, publishable key, and secret key.

Canonical site URL is `https://www.dialitin.ai`. The Vercel `*.vercel.app` alias remains a working host. Magic-link redirect is always `/admin/auth/callback`.

```bash
npm run dev
npm run check
```

## Supabase Auth redirect URLs

Add these Site URL / Redirect URL entries in Supabase Auth (Authentication → URL Configuration) so magic links work on every host:

- `https://www.dialitin.ai/admin/auth/callback`
- `https://dialitin.ai/admin/auth/callback`
- the current `*.vercel.app/admin/auth/callback` alias
