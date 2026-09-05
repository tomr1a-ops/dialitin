import { createClient } from "@supabase/supabase-js";

function getSecretConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  }

  return { url, secretKey };
}

export function createSecretSupabaseClient() {
  const { url, secretKey } = getSecretConfig();

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function pingSupabaseSecret() {
  const { url, secretKey } = getSecretConfig();
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: secretKey },
    cache: "no-store",
  });
  return res.ok;
}
