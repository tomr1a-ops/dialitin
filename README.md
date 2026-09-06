# DialItIn

Upload a full swing. Get the #1 thing holding you back — and exactly how to fix it.

**Design document:** [`docs/DialItIn_Design_Rev29.docx`](docs/DialItIn_Design_Rev29.docx).

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with your Supabase Project URL, publishable key, and secret key.

Canonical site URL is `https://dialitin.ai`. `www.dialitin.ai` should 308 to the apex. Magic-link `emailRedirectTo` is always built from `NEXT_PUBLIC_SITE_URL`, never the request host.

```bash
npm run dev
npm run check
```

## Supabase Auth redirect URLs

Keep the Supabase Auth Site URL as `https://dialitin.ai`. Add this Redirect URL so magic links exchange on the apex:

- `https://dialitin.ai/admin/auth/callback`
