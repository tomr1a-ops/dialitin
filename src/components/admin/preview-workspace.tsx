"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TestSwingListItem } from "@/lib/admin/test-swings";
import { ingestAdminClip } from "@/lib/ingest/ingest-admin-clip";
import { compareDiagnoses } from "@/lib/preview/compare";
import { poseBackendToPath } from "@/lib/preview/coverage";
import { diagnose, DRAFT_CONTENT_VERSION_ID } from "@/lib/preview/diagnose";
import type { PoseFrame } from "@/lib/pose/types";

export function PreviewWorkspace({
  swings,
  keypointsBySwing,
  publishedVersionId,
}: {
  swings: TestSwingListItem[];
  keypointsBySwing: Record<string, PoseFrame[]>;
  publishedVersionId: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    return swings.map((swing) => {
      const keypoints = keypointsBySwing[swing.id] ?? [];
      const draft = diagnose(keypoints, DRAFT_CONTENT_VERSION_ID);
      const published = publishedVersionId
        ? diagnose(keypoints, publishedVersionId)
        : null;
      return {
        swing,
        keypoints,
        compare: compareDiagnoses(draft, published),
      };
    });
  }, [keypointsBySwing, publishedVersionId, swings]);

  const changedCount = rows.filter((row) => row.compare.headlineChanged).length;

  async function runPose(onlyMissing: boolean) {
    const targets = swings.filter((swing) =>
      onlyMissing ? !swing.pose_run : true,
    );
    if (targets.length === 0) {
      setStatus("Nothing to process.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (let i = 0; i < targets.length; i++) {
        const swing = targets[i]!;
        setStatus(
          `Pose ${i + 1} of ${targets.length}: ${swing.golfer_label} (${swing.angle})`,
        );
        if (!swing.signed_url) {
          throw new Error(`No signed URL for ${swing.golfer_label}.`);
        }
        const response = await fetch(swing.signed_url);
        if (!response.ok) {
          throw new Error(`Could not download ${swing.golfer_label}.`);
        }
        const clip = await response.blob();
        const result = await ingestAdminClip(clip, {
          frameRate: Number(swing.frame_rate) || 30,
          onProgress(frame, totalFrames) {
            setStatus(
              `Pose ${i + 1} of ${targets.length}: ${swing.golfer_label} (${frame}/${totalFrames})`,
            );
          },
        });
        const posePath = poseBackendToPath(result.poseBackend);
        if (!posePath) {
          throw new Error("Pose runtime did not start.");
        }
        const save = await fetch(`/api/admin/test-swings/${swing.id}/pose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pose_backend: result.poseBackend,
            seconds_to_process: result.poseElapsedMs / 1000,
            frames: result.keypoints.map((frame, frameIndex) => ({
              frame_index: frameIndex,
              media_time: frame.mediaTime,
              landmarks: frame.landmarks,
              crop_box: frame.crop,
            })),
          }),
        });
        const json = (await save.json()) as { error?: string };
        if (!save.ok) {
          throw new Error(json.error ?? "Could not save keypoints.");
        }
      }
      setStatus(
        `Processed ${targets.length} swing${targets.length === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pose batch failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
        Engine stub. <code>diagnose(keypoints, contentVersionId)</code> returns
        null until Phase 1. Pose uses the Phase 0 client pipeline (640
        short-side, crop, 33 landmarks) in this admin browser.
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || swings.length === 0}
          onClick={() => void runPose(true)}
          className="min-h-11 rounded-xl bg-[#c8f542] px-4 font-semibold text-[#0b1210] disabled:opacity-50"
        >
          {busy ? "Running pose…" : "Run pose on clips without keypoints"}
        </button>
        <button
          type="button"
          disabled={busy || swings.length === 0}
          onClick={() => void runPose(false)}
          className="min-h-11 rounded-xl border border-white/20 px-4 text-sm text-white/80 disabled:opacity-50"
        >
          Re-run pose on all
        </button>
      </div>
      {status ? <p className="text-sm text-[#c8f542]">{status}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section>
        <h2 className="text-lg font-semibold">Coverage</h2>
        <p className="mt-1 text-xs text-white/50">
          Coverage = frames where all 33 landmarks have visibility ≥ 0.5. Path
          is worker or main (the Phase 0 browser runtime).
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-white/5 text-xs text-white/60">
              <tr>
                <th className="px-3 py-2 font-medium">Swing</th>
                <th className="px-3 py-2 font-medium">Frames</th>
                <th className="px-3 py-2 font-medium">Coverage %</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Seconds</th>
              </tr>
            </thead>
            <tbody>
              {swings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-white/45">
                    Upload clips on /admin/test-set first.
                  </td>
                </tr>
              ) : (
                swings.map((swing) => (
                  <tr key={swing.id} className="border-t border-white/10">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-[#c8f542]">
                        {swing.golfer_label}
                      </span>
                      <span className="ml-2 text-xs text-white/45">
                        {swing.club_family} · {swing.angle} · yaw{" "}
                        {swing.camera_yaw_marker}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {swing.pose_run?.frames_processed ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {swing.pose_run
                        ? `${Number(swing.pose_run.coverage_pct).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {swing.pose_run?.pose_path ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {swing.pose_run
                        ? Number(swing.pose_run.seconds_to_process).toFixed(2)
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">
          What would this have diagnosed
        </h2>
        <p className="mt-1 text-xs text-white/50">
          Draft catalog vs latest published snapshot
          {publishedVersionId ? ` (${publishedVersionId.slice(0, 8)}…)` : ""}.
          Swings whose headline would change: {changedCount}. When Phase 1
          replaces <code>diagnose()</code>, this table is the diff.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-white/5 text-xs text-white/60">
              <tr>
                <th className="px-3 py-2 font-medium">Swing</th>
                <th className="px-3 py-2 font-medium">Draft headline</th>
                <th className="px-3 py-2 font-medium">Published headline</th>
                <th className="px-3 py-2 font-medium">Changed?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.swing.id} className="border-t border-white/10">
                  <td className="px-3 py-2 font-semibold text-[#c8f542]">
                    {row.swing.golfer_label}
                  </td>
                  <td className="px-3 py-2 text-white/70">
                    {row.compare.draftHeadline ?? "— (engine stub)"}
                  </td>
                  <td className="px-3 py-2 text-white/70">
                    {row.compare.publishedHeadline ?? "— (engine stub)"}
                  </td>
                  <td className="px-3 py-2">
                    {row.compare.headlineChanged ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
