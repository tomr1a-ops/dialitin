"use client";

import { useState } from "react";

type CoachCallRow = {
  id: string;
  created_at: string;
  prompt: string;
  output: Record<string, unknown> | null;
  validation_result: { valid?: boolean; errors?: string[] } | null;
  model: string | null;
  cost_usd: number | null;
  coach_marks: { verdict: string }[] | null;
};

export function CoachLogWorkspace({ calls }: { calls: CoachCallRow[] }) {
  const [rows, setRows] = useState(calls);
  const [busy, setBusy] = useState<string | null>(null);

  async function submitMark(callId: string, verdict: string) {
    setBusy(callId);
    try {
      const res = await fetch("/api/admin/coach-marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coach_call_id: callId, verdict }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setRows((prev) =>
        prev.map((row) =>
          row.id === callId
            ? { ...row, coach_marks: [{ verdict }] }
            : row,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Coach log</h1>
      <p className="text-sm text-white/60">
        Pro review loop (6.8): mark each coach call right, wrong, or
        right-but-badly-worded.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-white/50">No coach calls yet.</p>
      ) : (
        rows.map((row) => {
          const currentMark = row.coach_marks?.[0]?.verdict;
          const output = row.output as {
            headline?: string;
            why?: string;
            feel_cue?: string;
          } | null;
          return (
            <article
              key={row.id}
              className="rounded-2xl border border-white/10 bg-[#101916] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-white/50">
                  {new Date(row.created_at).toLocaleString()} ·{" "}
                  {row.model ?? "fallback"} · cost{" "}
                  {row.cost_usd != null
                    ? `$${Number(row.cost_usd).toFixed(4)}`
                    : "—"}
                </p>
                <div className="flex gap-2">
                  {(["right", "wrong", "right_but_badly_worded"] as const).map(
                    (v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={busy === row.id}
                        className={`rounded-full px-3 py-1 text-xs ${
                          currentMark === v
                            ? "bg-[#c8f542] text-[#0b1210]"
                            : "border border-white/20 text-white/70"
                        }`}
                        onClick={() => submitMark(row.id, v)}
                      >
                        {v.replace(/_/g, " ")}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-white">
                {output?.headline ?? "(no headline)"}
              </p>
              <p className="mt-1 text-sm text-white/70">{output?.why}</p>
              <p className="mt-2 text-xs text-[#c8f542]">
                Cue: {output?.feel_cue}
              </p>
              {row.validation_result?.errors?.length ? (
                <p className="mt-2 text-xs text-amber-300/80">
                  Validation: {row.validation_result.errors.join("; ")}
                </p>
              ) : null}
            </article>
          );
        })
      )}
    </div>
  );
}
