#!/usr/bin/env node
/**
 * Merge Supabase + API keys into .env.local after `vercel env pull`.
 * Never prints secret values.
 */
import { execFileSync } from "node:child_process";
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

function serializeEnv(map) {
  const lines = ["# Generated / merged by scripts/merge-local-env.mjs"];
  for (const [key, value] of map.entries()) {
    lines.push(`${key}=${value}`);
  }
  return `${lines.join("\n")}\n`;
}

function setIfNonEmpty(map, key, value) {
  if (value?.trim()) {
    map.set(key, value.trim());
  }
}

function fromSupabaseCli() {
  const raw = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", "ludnczxnftmueibtbhrj", "-o", "json"],
    { encoding: "utf8" },
  );
  const keys = JSON.parse(raw);
  const secret =
    keys.find((k) => k.name === "swingread_secret" && k.type === "secret") ??
    keys.find((k) => k.type === "secret");
  const pub =
    keys.find((k) => k.name === "swingread_pub" && k.type === "publishable") ??
    keys.find((k) => k.type === "publishable");
  return {
    url: "https://ludnczxnftmueibtbhrj.supabase.co",
    secret: secret?.api_key ?? "",
    publishable: pub?.api_key ?? "",
  };
}

function fromBackup() {
  const backupPath = resolve(root, ".env.local.bak-vercel-pull");
  try {
    const map = parseEnv(readFileSync(backupPath, "utf8"));
    return {
      url:
        map.get("NEXT_PUBLIC_SUPABASE_URL") ??
        map.get("SUPABASE_URL") ??
        "",
      secret:
        map.get("SUPABASE_SECRET_KEY") ??
        map.get("SUPABASE_SERVICE_ROLE_KEY") ??
        "",
      publishable:
        map.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
        map.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
        "",
    };
  } catch {
    return { url: "", secret: "", publishable: "" };
  }
}

async function pingSecret(url, secret) {
  if (!url || !secret) return false;
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: secret },
    cache: "no-store",
  });
  return res.ok;
}

const map = parseEnv(readFileSync(envPath, "utf8"));
const backup = fromBackup();
const cli = fromSupabaseCli();

const candidates = [
  ["backup", backup],
  ["cli", cli],
];

let merged = false;
for (const [label, source] of candidates) {
  setIfNonEmpty(map, "NEXT_PUBLIC_SUPABASE_URL", source.url);
  setIfNonEmpty(map, "SUPABASE_URL", source.url);
  if (source.secret && (await pingSecret(source.url, source.secret))) {
    setIfNonEmpty(map, "SUPABASE_SECRET_KEY", source.secret);
    setIfNonEmpty(map, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", source.publishable);
    console.log(`Supabase secret: using ${label} (REST ping ok)`);
    merged = true;
    break;
  }
  console.log(`Supabase secret: ${label} REST ping failed (len=${source.secret.length})`);
}

if (!merged && cli.secret) {
  setIfNonEmpty(map, "SUPABASE_SECRET_KEY", cli.secret);
  setIfNonEmpty(map, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", cli.publishable);
  setIfNonEmpty(map, "NEXT_PUBLIC_SUPABASE_URL", cli.url);
  setIfNonEmpty(map, "SUPABASE_URL", cli.url);
  console.log("Supabase secret: merged CLI key (REST ping failed — may still fail writes)");
}

writeFileSync(envPath, serializeEnv(map));
for (const k of [
  "YOUTUBE_API_KEY",
  "ANTHROPIC_API_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
]) {
  const v = map.get(k) ?? "";
  console.log(`${k}: ${v.length > 0 ? `len=${v.length}` : "MISSING"}`);
}
