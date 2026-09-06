"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type JourneySwing = {
  id: string;
  created_at: string;
  club_family: string;
  angle: string;
  diagnoses: Array<{
    id: string;
    outcome: string;
    headline_fault: string | null;
    fault_key: string | null;
    delta_pct_stance: number | null;
    mode: string;
    outcomes: Array<{ did_it_work: string }>;
  }>;
};

export default function JourneyPage() {
  const [swings, setSwings] = useState<JourneySwing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/journey")
      .then((r) => r.json())
      .then((data) => setSwings(data.swings ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-8 text-white">
      <Link href="/" className="text-sm text-white/50">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Swing Journey</h1>
      <p className="mt-2 text-sm text-white/60">
        Your swings, faults, retest deltas, and did-it-work answers.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-white/50">Loading…</p>
      ) : swings.length === 0 ? (
        <p className="mt-8 text-sm text-white/50">
          No swings yet. Analyze your first swing to start your journey.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {swings.map((swing) => {
            const dx = swing.diagnoses[0];
            const outcome = dx?.outcomes[0]?.did_it_work;
            return (
              <li
                key={swing.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="text-xs text-white/50">
                  {new Date(swing.created_at).toLocaleString()} ·{" "}
                  {swing.club_family} · {swing.angle}
                </p>
                <p className="mt-2 font-semibold">
                  {dx?.headline_fault ?? dx?.outcome ?? "Pending"}
                </p>
                {dx?.fault_key ? (
                  <p className="mt-1 text-sm text-white/70">{dx.fault_key}</p>
                ) : null}
                {dx?.delta_pct_stance != null ? (
                  <p className="mt-1 text-sm text-[#c8f542]">
                    Retest delta: {dx.delta_pct_stance >= 0 ? "+" : ""}
                    {dx.delta_pct_stance.toFixed(1)}% stance width
                  </p>
                ) : null}
                {outcome ? (
                  <p className="mt-1 text-sm text-white/60">
                    Did it work? {outcome}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
