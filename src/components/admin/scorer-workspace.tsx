"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ScorerRunResult } from "@/lib/admin/scorer";

const PHASES = ["address", "takeaway", "top", "impact", "finish"] as const;

function statusClass(status: string) {
  switch (status) {
    case "pass":
      return "text-[#c8f542]";
    case "fail":
      return "text-red-300";
    case "unmarked":
      return "text-white/45";
    case "no-band":
      return "text-[#f3c36a]";
    case "not-read":
      return "text-white/50";
    default:
      return "text-white/70";
  }
}

export function ScorerWorkspace({
  initialResult,
  contentVersionId,
  latestRunAt,
}: {
  initialResult: ScorerRunResult | null;
  contentVersionId: string | null;
  latestRunAt: string | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState(initialResult);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function rerunAll() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/scorer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_version_id: contentVersionId,
        }),
      });
      const json = (await res.json()) as ScorerRunResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Scorer run failed.");
      }
      setResult(json);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scorer run failed.");
    } finally {
      setBusy(false);
    }
  }

  const metricKeys = result
    ? Array.from(
        new Set(result.rows.flatMap((row) => Object.keys(row.metrics))),
      ).sort()
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void rerunAll()}
          className="min-h-11 rounded-xl bg-[#c8f542] px-4 text-sm font-semibold text-[#0b1210] disabled:opacity-50"
        >
          {busy ? "Running…" : "Re-run all"}
        </button>
        {contentVersionId ? (
          <span className="text-xs text-white/50">
            Content version {contentVersionId.slice(0, 8)}…
          </span>
        ) : null}
        {latestRunAt ? (
          <span className="text-xs text-white/50">
            Last stored run {new Date(latestRunAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {!result || result.rows.length === 0 ? (
        <p className="text-sm text-white/50">
          No clips with keypoints yet. Upload and run pose on /admin/test-set,
          then re-run the scorer.
        </p>
      ) : (
        <>
          <p className="text-sm text-white/70">
            Summary: {result.summary.clipsAllPhasesCorrect}/
            {result.summary.clipsTotal} clips all phases correct (marked only),{" "}
            {result.summary.metricsWithinTolerance}/
            {result.summary.metricsEvaluated} metrics within tolerance. Angle
            mismatches: {result.summary.angleMismatches}.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-[1200px] w-full text-left text-xs">
              <thead className="bg-white/5 text-white/60">
                <tr>
                  <th className="px-2 py-2 font-medium">Clip</th>
                  <th className="px-2 py-2 font-medium">Angle</th>
                  {PHASES.map((phase) => (
                    <th key={phase} className="px-2 py-2 font-medium">
                      {phase}
                    </th>
                  ))}
                  {metricKeys.map((key) => (
                    <th key={key} className="px-2 py-2 font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.clipId} className="border-t border-white/10">
                    <td className="px-2 py-2 font-mono">{row.label}</td>
                    <td className="px-2 py-2">
                      {row.detectedAngle ?? "—"}
                      {row.angleMismatch ? (
                        <span className="ml-1 rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">
                          ≠ {row.labeledAngle}
                        </span>
                      ) : (
                        <span className="ml-1 text-white/40">
                          = {row.labeledAngle ?? "—"}
                        </span>
                      )}
                    </td>
                    {PHASES.map((phase) => {
                      const cell = row.phases[phase];
                      return (
                        <td
                          key={phase}
                          className={`px-2 py-2 ${statusClass(cell.status)}`}
                        >
                          {cell.status === "unmarked"
                            ? "unmarked"
                            : cell.status === "invalid"
                              ? "invalid"
                              : `${cell.detected ?? "—"} vs ${cell.marked ?? "—"} (Δ${cell.deltaFrames ?? "—"}) ${cell.status}`}
                        </td>
                      );
                    })}
                    {metricKeys.map((key) => {
                      const metric = row.metrics[key];
                      if (!metric) {
                        return (
                          <td key={key} className="px-2 py-2 text-white/30">
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={key}
                          className={`px-2 py-2 ${statusClass(metric.status)}`}
                        >
                          {metric.status}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
