"use client";

import { useMemo, useState } from "react";
import { ingestClip } from "@/lib/ingest/ingest-clip";

type HarvestTier = "reference" | "answer_key";

type SearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSec: number;
  url: string;
  tier: HarvestTier;
  sourceLine: string;
  passedFilters: boolean;
};

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function HarvestWorkspace() {
  const [text, setText] = useState("");
  const [defaultTier, setDefaultTier] = useState<HarvestTier>("reference");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({
    found: 0,
    fetched: 0,
    passedGate: 0,
    split: 0,
  });

  const selectedItems = useMemo(
    () => results.filter((row) => selected[row.videoId]),
    [results, selected],
  );

  async function onSearch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("Searching YouTube…");
    try {
      const response = await fetch("/api/admin/harvest/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, defaultTier }),
      });
      const json = (await response.json()) as {
        error?: string;
        filtered?: number;
        results?: SearchResult[];
      };
      if (!response.ok) {
        throw new Error(json.error ?? "Search failed.");
      }
      const rows = json.results ?? [];
      setResults(rows);
      setSelected(Object.fromEntries(rows.map((row) => [row.videoId, false])));
      setCounts((current) => ({ ...current, found: rows.length }));
      setStatus(`Found ${rows.length} videos passing filters.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function runPipelineForSwing(
    swingId: string,
    signedUrl: string,
    title: string,
  ) {
    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new Error(`Could not download ${title}.`);
    }
    const clip = new Blob([await response.arrayBuffer()], {
      type: "video/mp4",
    });
    const result = await ingestClip(clip, {
      capturePath: "upload",
      fileName: title,
      handedness: "right",
      labeledFrameRate: null,
      orientationSamples: [],
    });
    const pipelineRes = await fetch(`/api/admin/harvest/${swingId}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frames: result.keypoints,
        frame_rate_detected: result.detectedFrameRate,
        handedness: "right",
      }),
    });
    const pipelineJson = (await pipelineRes.json()) as {
      error?: string;
      passedGate?: boolean;
      splitCount?: number;
    };
    if (!pipelineRes.ok) {
      throw new Error(pipelineJson.error ?? "Pipeline failed.");
    }
    return pipelineJson;
  }

  async function onRunWorker() {
    setBusy(true);
    setError("");
    setStatus("Starting full harvest on Railway worker…");
    try {
      const response = await fetch("/api/admin/harvest/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: true }),
      });
      const json = (await response.json()) as {
        error?: string;
        found?: number;
        fetched?: number;
        uploaded?: number;
        passedGate?: number;
        clipsAfterSplit?: number;
        seedInserted?: number;
        blockers?: string[];
      };
      if (!response.ok) {
        throw new Error(json.error ?? "Worker run failed.");
      }
      setCounts((current) => ({
        ...current,
        found: json.found ?? current.found,
        fetched: current.fetched + (json.fetched ?? 0),
        passedGate: current.passedGate + (json.passedGate ?? 0),
        split: current.split + (json.clipsAfterSplit ?? 0),
      }));
      const blockers = json.blockers?.length
        ? ` Blockers: ${json.blockers.join("; ")}`
        : "";
      setStatus(
        `Worker finished — found ${json.found ?? 0}, fetched ${json.fetched ?? 0}, uploaded ${json.uploaded ?? 0}, passed gate ${json.passedGate ?? 0}, seed ${json.seedInserted ?? 0}.${blockers}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Worker run failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function onFetchSelected() {
    if (selectedItems.length === 0) {
      setError("Select at least one video.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus(`Fetching ${selectedItems.length} videos (max 10)…`);
    try {
      const fetchRes = await fetch("/api/admin/harvest/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems.map((item) => ({
            videoId: item.videoId,
            url: item.url,
            title: item.title,
            channelTitle: item.channelTitle,
            tier: item.tier,
          })),
        }),
      });
      const fetchJson = (await fetchRes.json()) as {
        error?: string;
        fetched?: number;
        results?: Array<{
          videoId: string;
          swingId: string | null;
          error: string | null;
        }>;
      };
      if (!fetchRes.ok) {
        throw new Error(fetchJson.error ?? "Fetch failed.");
      }

      let passed = 0;
      let split = 0;
      const fetched = fetchJson.fetched ?? 0;
      const swingRes = await fetch("/api/admin/test-swings");
      const swingJson = (await swingRes.json()) as {
        swings?: Array<{ id: string; signed_url: string | null; golfer_label: string | null }>;
      };
      const swingById = new Map(
        (swingJson.swings ?? []).map((item) => [item.id, item]),
      );

      for (const row of fetchJson.results ?? []) {
        if (!row.swingId) {
          continue;
        }
        setStatus(`Running pose pipeline on ${row.videoId}…`);
        const swing = swingById.get(row.swingId);
        const signedUrl = swing?.signed_url;
        if (!signedUrl) {
          continue;
        }
        const pipeline = await runPipelineForSwing(
          row.swingId,
          signedUrl,
          swing.golfer_label ?? row.videoId,
        );
        if (pipeline.passedGate) {
          passed += 1;
        }
        split += pipeline.splitCount ?? 0;
      }

      setCounts((current) => ({
        ...current,
        fetched: current.fetched + fetched,
        passedGate: current.passedGate + passed,
        split: current.split + split,
      }));
      setStatus(
        `Fetched ${fetched}. Passed gate: ${passed}. Split into ${split} swings.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-[#c8f542]">Harvester</h1>
        <p className="text-sm text-white/60">
          Paste search queries or YouTube URLs. Prefix a line with{" "}
          <code className="text-white/80">[reference]</code> or{" "}
          <code className="text-white/80">[answer_key]</code>. Nothing is
          fetched until you select rows and click Fetch.
        </p>
      </header>

      <form onSubmit={onSearch} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="block text-xs text-white/60">
          Default tier
          <select
            value={defaultTier}
            onChange={(event) =>
              setDefaultTier(event.target.value as HarvestTier)
            }
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0b1210] px-3 py-2 text-sm"
          >
            <option value="reference">reference (tour / elite)</option>
            <option value="answer_key">answer_key (amateur)</option>
          </select>
        </label>
        <label className="block text-xs text-white/60">
          Queries or URLs (one per line)
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder={`[reference] tour slow motion driver down the line\n[answer_key] amateur slice fix face on swing\nhttps://www.youtube.com/watch?v=…`}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0b1210] px-3 py-2 font-mono text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[#c8f542] px-4 py-2 text-sm font-medium text-[#0b1210] disabled:opacity-50"
          >
            Search
          </button>
          <button
            type="button"
            disabled={busy || selectedItems.length === 0}
            onClick={() => void onFetchSelected()}
            className="rounded-lg border border-[#c8f542]/40 px-4 py-2 text-sm text-[#c8f542] disabled:opacity-50"
          >
            Fetch selected ({selectedItems.length})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRunWorker()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 disabled:opacity-50"
          >
            Run on worker
          </button>
        </div>
      </form>

      {(status || error) && (
        <p className={`text-sm ${error ? "text-red-300" : "text-white/70"}`}>
          {error || status}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Found", counts.found],
          ["Fetched", counts.fetched],
          ["Passed gate", counts.passedGate],
          ["Split swings", counts.split],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center"
          >
            <p className="text-xs text-white/50">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="px-3 py-2">Fetch</th>
                <th className="px-3 py-2">Thumb</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Tier</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.videoId} className="border-b border-white/5">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[row.videoId])}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [row.videoId]: event.target.checked,
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {row.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.thumbnailUrl}
                        alt=""
                        className="h-12 w-20 rounded object-cover"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#c8f542] hover:underline"
                    >
                      {row.title}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-white/70">{row.channelTitle}</td>
                  <td className="px-3 py-2">{formatDuration(row.durationSec)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs">
                      {row.tier}
                    </span>
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
