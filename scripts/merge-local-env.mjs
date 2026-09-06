#!/usr/bin/env node
/**
 * Fill missing Supabase public vars after `vercel env pull`.
 * Never overwrites non-empty values from Vercel (especially SUPABASE_SECRET_KEY).
 * Never prints secret values.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");

function parseEnv(raw) {
  const map = new Map();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function setIfEmpty(map, key, value) {
  const current = map.get(key)?.trim() ?? "";
  if (!current && value?.trim()) {
    map.set(key, value.trim());
    return true;
  }
  return false;
}

const map = parseEnv(readFileSync(envPath, "utf8"));
const url = "https://ludnczxnftmueibtbhrj.supabase.co";

const filled = [
  setIfEmpty(map, "NEXT_PUBLIC_SUPABASE_URL", url),
  setIfEmpty(map, "SUPABASE_URL", url),
].some(Boolean);

const secretLen = (map.get("SUPABASE_SECRET_KEY") ?? "").trim().length;
if (secretLen > 0) {
  console.log(`Supabase secret: keeping Vercel value (len=${secretLen})`);
} else {
  console.log("Supabase secret: MISSING — re-run vercel env pull or paste in dashboard");
}

if (filled) {
  const lines = [];
  for (const [key, value] of map.entries()) {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(envPath, `${lines.join("\n")}\n`);
  console.log("Merged missing public Supabase URL vars");
} else {
  console.log("No merge needed");
}

for (const k of [
  "YOUTUBE_API_KEY",
  "ANTHROPIC_API_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]) {
  const v = map.get(k) ?? "";
  console.log(`${k}: ${v.length > 0 ? `len=${v.length}` : "MISSING"}`);
}
