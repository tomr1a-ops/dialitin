#!/usr/bin/env npx tsx
/**
 * Train strike classifier from labeled test_swing_keypoints rows.
 * No-op until strike_label + capture_path + club_family exist.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  trainStrikeClassifier,
  type LabeledStrikeRow,
} from "../src/lib/engine/strike-classifier";
import { createSecretSupabaseClient } from "../src/lib/supabase/admin";

function loadEnvFile(path: string) {
  try {
    const raw = readFileSync(path, "utf8");
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(process.cwd(), ".env.development.local"));

async function main() {
  const secret = createSecretSupabaseClient();
  const { data: rows } = await secret
    .from("test_swing_keypoints")
    .select(
      "id, strike_features, strike_label, test_swings!inner(capture_path, club_family)",
    )
    .not("strike_label", "is", null)
    .not("strike_features", "is", null);

  const labeled: LabeledStrikeRow[] = [];
  for (const row of rows ?? []) {
    const parent = row.test_swings as {
      capture_path: string | null;
      club_family: string | null;
    };
    if (!parent.capture_path || !parent.club_family) {
      continue;
    }
    labeled.push({
      id: row.id as string,
      strike_features: row.strike_features as LabeledStrikeRow["strike_features"],
      strike_label: row.strike_label as LabeledStrikeRow["strike_label"],
      capture_path: parent.capture_path,
      club_family: parent.club_family,
    });
  }

  const classifier = await trainStrikeClassifier(labeled);
  console.log(
    `Strike classifier: enabled=${classifier.enabled}, labeled_rows=${labeled.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
