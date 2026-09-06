import type { RevealInput, RevealSession } from "@/lib/reveal/types";

const KEY = "dialitin.reveal.session";

export type StoredRevealSession = RevealSession & {
  isFirstResult?: boolean;
  coachCall?: {
    id: string | null;
    validation: { valid: boolean; errors: string[] };
    costUsd: number | null;
  } | null;
};

export function saveRevealSession(session: StoredRevealSession): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function loadRevealSession(): StoredRevealSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredRevealSession;
  } catch {
    return null;
  }
}

export function patchRevealInput(input: Partial<RevealInput>): void {
  const current = loadRevealSession();
  if (!current) {
    return;
  }
  saveRevealSession({ ...current, input: { ...current.input, ...input } });
}
