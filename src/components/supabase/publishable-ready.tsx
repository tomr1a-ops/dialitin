"use client";

import { useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SupabasePublishableReady() {
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void supabase.auth.getSession();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      return;
    }
    void fetch(`${url}/auth/v1/health`, {
      headers: { apikey: publishableKey },
    });
  }, []);

  return null;
}
