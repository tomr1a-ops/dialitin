import {
  EXTERNAL_CUE_RULE,
  FEEL_CUE_BLOCKED_WORDS,
  FEEL_CUE_MAX_WORDS,
} from "@/lib/admin/constants";

export type FeelCueResult =
  | { ok: true; wordCount: number }
  | { ok: false; wordCount: number; reason: string; rule: string };

function wordsIn(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

export function validateFeelCue(feelCue: string): FeelCueResult {
  const words = wordsIn(feelCue);
  const wordCount = words.length;

  if (wordCount > FEEL_CUE_MAX_WORDS) {
    return {
      ok: false,
      wordCount,
      reason: `Feel cue is ${wordCount} words; the limit is ${FEEL_CUE_MAX_WORDS}.`,
      rule: EXTERNAL_CUE_RULE,
    };
  }

  const blocked = new Set<string>();
  for (const word of words) {
    const token = word.toLowerCase().replace(/[^a-z]/g, "");
    for (const banned of FEEL_CUE_BLOCKED_WORDS) {
      if (token === banned || token.startsWith(banned)) {
        blocked.add(banned);
      }
    }
  }

  if (blocked.size > 0) {
    const named = [...blocked].join(", ");
    return {
      ok: false,
      wordCount,
      reason: `Feel cue names the body (${named}).`,
      rule: EXTERNAL_CUE_RULE,
    };
  }

  return { ok: true, wordCount };
}
