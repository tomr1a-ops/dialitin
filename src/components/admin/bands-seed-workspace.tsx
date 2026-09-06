"use client";

import { useState } from "react";
import type { BandsSeedPreview } from "@/lib/admin/bands-seed";

type SeedCell = BandsSeedPreview["cells"][number];

function MetricScatter({ cell }: { cell: SeedCell }) {
  const min = cell.p5 ?? Math.min(...cell.values);
  const max = cell.p95 ?? Math.max(...cell.values);
  const span = max - min || 1;
  const width = 220;
  const height = 56;

  return (
    <svg width={width} height={height} className="text-[#c8f542]">
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="currentColor"
        strokeOpacity={0.2}
      />
      {cell.p5 != null && (
        <line
          x1={((cell.p5 - min) / span) * width}
          y1={4}
          x2={((cell.p5 - min) / span) * width}
          y2={height - 4}
          stroke="#f59e0b"
          strokeDasharray="3 3"
        />
      )}
      {cell.p95 != null && (
        <line
          x1={((cell.p95 - min) / span) * width}
          y1={4}
          x2={((cell.p95 - min) / span) * width}
          y2={height - 4}
          stroke="#f59e0b"
          strokeDasharray="3 3"
        />
      )}
      {cell.scatter.map((point, index) => (
        <circle
          key={`${point.swingId}-${index}`}
          cx={((point.value - min) / span) * width}
          cy={height / 2 + (index % 3) * 4 - 4}
          r={3}
          fill="currentColor"
          fillOpacity={0.85}
        />
      ))}
    </svg>
  );
}

export function BandsSeedWorkspace({
  initialPreview,
}: {
  initialPreview: BandsSeedPreview;
}) {
  const [preview, setPreview] = useState(initialPreview);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    setError("");
    const response = await fetch("/api/admin/bands/seed");
    const json = (await response.json()) as {
      error?: string;
      preview?: BandsSeedPreview;
    };
    if (!response.ok) {
      throw new Error(json.error ?? "Could not load preview.");
    }
    setPreview(json.preview ?? { cells: [], clipCount: 0, sampleCount: 0 });
  }

  async function onSeed() {
    setBusy(true);
    setError("");
    setStatus("Seeding bands from reference tier…");
    try {
      const response = await fetch("/api/admin/bands/seed", { method: "POST" });
      const json = (await response.json()) as {
        error?: string;
        inserted?: number;
      };
      if (!response.ok) {
        throw new Error(json.error ?? "Seed failed.");
      }
      setStatus(
        `Inserted ${json.inserted ?? 0} seeded_unsigned band(s). Engine ignores these until published and signed.`,
      );
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-[#c8f542]">Band seeding</h1>
        <p className="text-sm text-white/60">
          Per metric × club family × angle: 5th–95th percentile of reference-tier
          clips that passed the angle gate. Creates{" "}
          <code className="text-white/80">seeded_unsigned</code> drafts — the
          engine never reads them until a pro publishes a signed snapshot.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSeed()}
          className="rounded-lg bg-[#c8f542] px-4 py-2 text-sm font-medium text-[#0b1210] disabled:opacity-50"
        >
          Seed from reference tier
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadPreview().catch((err) => setError(String(err)))}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80"
        >
          Refresh preview
        </button>
        <span className="text-sm text-white/50">
          {preview.clipCount} reference clips · {preview.cells.length} cells
        </span>
      </div>

      {(status || error) && (
        <p className={`text-sm ${error ? "text-red-300" : "text-white/70"}`}>
          {error || status}
        </p>
      )}

      {preview.cells.length === 0 && (
        <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          No seed cells yet — harvest reference footage, run the pipeline, and
          ensure clips have a known club family from the title.
        </p>
      )}

      {preview.cells.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">Club</th>
                <th className="px-3 py-2">Angle</th>
                <th className="px-3 py-2">n</th>
                <th className="px-3 py-2">P5</th>
                <th className="px-3 py-2">P95</th>
                <th className="px-3 py-2">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {preview.cells.map((cell) => (
                <tr
                  key={`${cell.metricKey}-${cell.clubFamily}-${cell.angle}`}
                  className="border-b border-white/5"
                >
                  <td className="px-3 py-2 font-mono text-xs">{cell.metricKey}</td>
                  <td className="px-3 py-2">{cell.clubFamily}</td>
                  <td className="px-3 py-2">{cell.angle}</td>
                  <td className="px-3 py-2">{cell.n}</td>
                  <td className="px-3 py-2">
                    {cell.p5 != null ? cell.p5.toFixed(3) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {cell.p95 != null ? cell.p95.toFixed(3) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <MetricScatter cell={cell} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
