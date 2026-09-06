import { createClient } from "@supabase/supabase-js";

function getSecretConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  }

  return { url, secretKey };
}

function isNewSecretKey(key: string) {
  return key.startsWith("sb_secret_");
}

/** sb_secret keys must not be sent as Authorization Bearer (PostgREST rejects them). */
function fetchWithoutSecretBearer(secretKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const auth = headers.get("Authorization");
    if (auth?.startsWith("Bearer sb_")) {
      headers.delete("Authorization");
    }
    return fetch(input, { ...init, headers });
  };
}

export function createSecretSupabaseClient() {
  const { url, secretKey } = getSecretConfig();

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: isNewSecretKey(secretKey)
      ? { fetch: fetchWithoutSecretBearer(secretKey) }
      : undefined,
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
