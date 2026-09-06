"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SkeletonOverlay } from "@/components/pose/skeleton-overlay";
import { DtlMetricPhaseStill } from "@/components/admin/dtl-metric-phase-still";
import { MetricPhaseStill } from "@/components/admin/metric-phase-still";
import { PhaseDiagnosticChart } from "@/components/admin/phase-diagnostic-chart";
import type { GroundTruthPhaseMarks, TestSwingListItem } from "@/lib/admin/test-swings";
import type { FaceOnMetricKey } from "@/lib/engine/metrics/faceOn";
import type { DtlMetricKey } from "@/lib/engine/metrics/dtl";
import { activeMetricSet } from "@/lib/engine/metrics/storage";
import { reconstructLeadWristPath } from "@/lib/engine/occlusion";
import type { DiagnosisResult } from "@/lib/engine/diagnose";
import {
  labeledAngleMismatch,
} from "@/lib/engine/angle";
import type { PhaseMark, SwingPhases } from "@/lib/engine/phases";
import { LEFT_HIP, RIGHT_HIP, type PoseFrame } from "@/lib/pose/types";

const CONTENT_VERSION = "published";

const FACE_ON_METRIC_ORDER: FaceOnMetricKey[] = [
  "shoulder_rotation_top",
  "hip_rotation_top",
  "trail_knee_flexion_change",
  "hip_sway_back",
  "hip_slide_down",
  "head_sway",
  "head_lift",
  "weight_transfer_proxy",
  "width_at_top",
  "lead_elbow_separation",
  "sequence_proxy",
  "tempo_ratio",
  "ball_position_inferred",
];

const DTL_METRIC_ORDER: DtlMetricKey[] = [
  "spine_tilt_address",
  "tush_line_pelvis",
  "tush_line_family",
  "lead_hip_clearance_impact",
  "spine_tilt_change",
  "head_lift_dtl",
  "delivery_slot",
  "sequence_proxy",
  "tempo_ratio",
];

function tushLineAtAddress(
  keypoints: PoseFrame[],
  addressIdx: number,
  handedness: "left" | "right",
): number | null {
  const frame = keypoints[addressIdx];
  if (!frame) {
    return null;
  }
  const trailHip = handedness === "right" ? RIGHT_HIP : LEFT_HIP;
  const point = frame.landmarks[trailHip];
  if (!point || point.visibility < 0.35) {
    return null;
  }
  return point.x;
}

function formatMetricValue(value: number, unit: string) {
  if (unit === "ratio" || unit === "normalized_rotation") {
    return value.toFixed(3);
  }
  if (unit === "seconds") {
    return `${(value * 1000).toFixed(1)} ms`;
  }
  return value.toFixed(2);
}
const PHASE_ORDER = [
  "address",
  "takeaway",
  "top",
  "impact",
  "finish",
] as const satisfies ReadonlyArray<
  keyof Pick<SwingPhases, "address" | "takeaway" | "top" | "impact" | "finish">
>;

function nearestFrameIndex(keypoints: PoseFrame[], timeSec: number): number {
  if (keypoints.length === 0) {
    return 0;
  }
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < keypoints.length; i++) {
    const delta = Math.abs(keypoints[i]!.mediaTime - timeSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

function phaseList(phases: SwingPhases) {
  return PHASE_ORDER.map((key) => ({ key, mark: phases[key] as PhaseMark }));
}

export function PreviewWorkspace({
  swings,
  selectedId,
  diagnosis: diagnosisProp = null,
}: {
  swings: TestSwingListItem[];
  selectedId: string | null;
  diagnosis?: DiagnosisResult | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const impactVideoRef = useRef<HTMLVideoElement>(null);
  const [markBusy, setMarkBusy] = useState(false);
  const [markMessage, setMarkMessage] = useState("");
  const [showAllLandmarks, setShowAllLandmarks] = useState(false);
  const [ballLabelBusy, setBallLabelBusy] = useState(false);
  const [strikeLabelBusy, setStrikeLabelBusy] = useState(false);
  const selected =
    swings.find((swing) => swing.id === selectedId) ?? swings[0] ?? null;
  const pose = selected?.keypoints ?? null;
  const phaseMarks = pose?.phase_marks ?? {};
  const diagnosis = diagnosisProp;
  const keypoints = pose?.keypoints ?? [];
  const coverage = pose?.coverage ?? [];
  const phases = pose?.phases ?? null;
  const angle = pose?.angle ?? null;
  const storedMetrics = pose?.metrics ?? null;
  const activeSet = activeMetricSet(
    storedMetrics,
    angle?.classification.value,
  );
  const faceOnMetrics = storedMetrics?.face_on ?? null;
  const dtlMetrics = storedMetrics?.dtl ?? null;
  const wristReconstruction = useMemo(() => {
    if (
      activeSet !== "dtl" ||
      !phases?.impact.valid ||
      keypoints.length === 0
    ) {
      return null;
    }
    return reconstructLeadWristPath({
      frames: keypoints,
      phases,
      handedness: selected?.handedness === "left" ? "left" : "right",
      capturePath: selected?.capture_path ?? "upload",
    });
  }, [activeSet, keypoints, phases, selected?.capture_path, selected?.handedness]);
  const angleMismatch = labeledAngleMismatch(selected?.angle, angle);
  const lastMediaTime = keypoints.at(-1)?.mediaTime;
  const duration = lastMediaTime && lastMediaTime > 0 ? lastMediaTime : 1;

  async function labelBallAtClick(event: React.MouseEvent<HTMLVideoElement>) {
    if (!selected?.id || !videoRef.current || keypoints.length === 0) {
      return;
    }
    const video = videoRef.current;
    const rect = video.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const frameIndex = nearestFrameIndex(keypoints, video.currentTime);
    const size = 0.025;
    const box = {
      x: x * video.videoWidth - (size * video.videoWidth) / 2,
      y: y * video.videoHeight - (size * video.videoHeight) / 2,
      width: size * video.videoWidth,
      height: size * video.videoHeight,
      confidence: 1,
    };
    const next = {
      ...(pose?.ball_labels ?? {}),
      [String(frameIndex)]: box,
    };
    setBallLabelBusy(true);
    try {
      const res = await fetch(
        `/api/admin/test-swings/${selected.id}/ball-labels`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ball_labels: next,
            keypoint_id: pose?.id,
          }),
        },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Could not save ball label.");
      }
      setMarkMessage(`Ball box at frame ${frameIndex}.`);
      router.refresh();
    } catch (err) {
      setMarkMessage(
        err instanceof Error ? err.message : "Ball label save failed.",
      );
    } finally {
      setBallLabelBusy(false);
    }
  }

  async function saveStrikeLabel(label: string) {
    if (!selected?.id) {
      return;
    }
    setStrikeLabelBusy(true);
    try {
      const res = await fetch(
        `/api/admin/test-swings/${selected.id}/strike-label`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strike_label: label || null,
            keypoint_id: pose?.id,
          }),
        },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Could not save strike label.");
      }
      setMarkMessage(`Strike label: ${label || "cleared"}.`);
      router.refresh();
    } catch (err) {
      setMarkMessage(
        err instanceof Error ? err.message : "Strike label save failed.",
      );
    } finally {
      setStrikeLabelBusy(false);
    }
  }

  const strikeFeatures = pose?.strike_features ?? null;
  const strikeLabel = pose?.strike_label ?? "";

  async function markPhase(phase: keyof GroundTruthPhaseMarks) {
    if (!selected?.id || !videoRef.current || keypoints.length === 0) {
      return;
    }
    const frameIndex = nearestFrameIndex(
      keypoints,
      videoRef.current.currentTime,
    );
    const next = { ...phaseMarks, [phase]: frameIndex };
    setMarkBusy(true);
    setMarkMessage("");
    try {
      const res = await fetch(
        `/api/admin/test-swings/${selected.id}/phase-marks`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase_marks: next,
            keypoint_id: pose?.id,
          }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not save phase marks.");
      }
      setMarkMessage(`Marked ${phase} at frame ${frameIndex}.`);
      router.refresh();
    } catch (err) {
      setMarkMessage(
        err instanceof Error ? err.message : "Could not save phase marks.",
      );
    } finally {
      setMarkBusy(false);
    }
  }

  useEffect(() => {
    const video = impactVideoRef.current;
    const impact = phases?.impact;
    if (!video || !impact?.valid) {
      return;
    }
    const seek = () => {
      video.currentTime = impact.timeMs / 1000;
    };
    if (video.readyState >= 1) {
      seek();
    } else {
      video.addEventListener("loadedmetadata", seek, { once: true });
    }
  }, [phases, selected?.signed_url]);

  return (
    <div className="flex flex-col gap-6">
      <label className="text-sm text-white/70">
        Test swing
        <select
          className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b1210] px-3"
          value={selected?.id ?? ""}
          onChange={(event) =>
            router.push(`/admin/preview?swing=${event.target.value}`)
          }
        >
          {swings.map((swing) => (
            <option key={swing.id} value={swing.id}>
              {swing.golfer_label ?? swing.id.slice(0, 8)} ·{" "}
              {swing.club_family ?? "club"} · {swing.angle ?? "angle"}
            </option>
          ))}
        </select>
      </label>

      {!selected ? (
        <p className="text-sm text-white/50">
          Upload a clip on /admin/test-set.
        </p>
      ) : (
        <>
          {(selected.pro_label_fault_1 || selected.pro_label_fault_2) && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-white/45">
                Pro labels
              </p>
              <p className="mt-1 text-white/85">
                {selected.pro_label_fault_1 ?? "—"}
                {selected.pro_label_fault_2
                  ? ` · ${selected.pro_label_fault_2}`
                  : ""}
              </p>
            </div>
          )}

          <div className="relative overflow-hidden rounded-2xl bg-black">
            {selected.signed_url ? (
              <video
                ref={videoRef}
                className="aspect-video w-full object-contain"
                src={selected.signed_url}
                controls
                playsInline
                preload="auto"
                onClick={labelBallAtClick}
              />
            ) : (
              <p className="p-6 text-sm text-white/50">No signed clip URL.</p>
            )}
            <SkeletonOverlay
              videoRef={videoRef}
              keypoints={keypoints}
              showAllLandmarks={showAllLandmarks}
            />
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={showAllLandmarks}
              onChange={(event) => setShowAllLandmarks(event.target.checked)}
              className="rounded border-white/20"
            />
            Show all 33 MediaPipe landmarks
          </label>

          <section>
            <h2 className="text-lg font-semibold">Phase diagnostics</h2>
            <p className="mt-1 text-xs text-white/50">
              Hand-centroid height (inverted y) and speed — phase ticks overlaid.
            </p>
            {phases && keypoints.length > 0 ? (
              <PhaseDiagnosticChart
                keypoints={keypoints}
                phases={phases}
                handedness={selected.handedness === "left" ? "left" : "right"}
                durationSeconds={duration}
              />
            ) : null}
            <h3 className="mt-4 text-sm font-medium text-white/70">Scrubber</h3>
            <div className="relative mt-3 h-12 overflow-hidden rounded-md bg-white/8">
              {phases ? (
                phaseList(phases).map(({ key, mark }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!mark.valid}
                    aria-label={`${key} ${mark.timeMs.toFixed(0)} ms`}
                    className="absolute top-1 flex -translate-x-1/2 flex-col items-center disabled:opacity-30"
                    style={{
                      left: `${(mark.timeMs / 1000 / duration) * 100}%`,
                    }}
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = mark.timeMs / 1000;
                      }
                    }}
                  >
                    <span className="h-5 w-px bg-[#c8f542]" />
                    <span className="mt-0.5 text-[10px] uppercase tracking-wide text-[#c8f542]">
                      {key}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-3 text-xs text-white/45">
                  Run pose on /admin/test-set to store phases.
                </p>
              )}
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-[#101916] p-3">
              <h3 className="text-sm font-medium text-white/70">Mark phases</h3>
              <p className="mt-1 text-xs text-white/45">
                Scrub the clip, then click a phase to store the ground-truth
                frame index on this keypoint row.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {PHASE_ORDER.map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    disabled={markBusy || keypoints.length === 0}
                    onClick={() => void markPhase(phase)}
                    className="min-h-9 rounded-lg border border-white/15 px-3 text-xs uppercase tracking-wide text-white/80 disabled:opacity-40"
                  >
                    {phase}
                    {phaseMarks[phase] !== undefined
                      ? ` · f${phaseMarks[phase]}`
                      : ""}
                  </button>
                ))}
              </div>
              {markMessage ? (
                <p className="mt-2 text-xs text-white/55">{markMessage}</p>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Impact still</h2>
            {phases?.impact.valid && selected.signed_url ? (
              <div className="relative mt-2 overflow-hidden rounded-2xl bg-black">
                <video
                  ref={impactVideoRef}
                  className="aspect-video w-full object-contain"
                  src={selected.signed_url}
                  muted
                  playsInline
                  preload="auto"
                />
                <SkeletonOverlay
                  videoRef={impactVideoRef}
                  keypoints={keypoints}
                  showAllLandmarks={showAllLandmarks}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/50">
                No valid impact frame yet.
              </p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Angle</h2>
            {!angle ? (
              <p className="mt-2 text-sm text-white/50">
                Run pose on /admin/test-set to compute camera angle.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-[640px] w-full text-left text-sm">
                  <tbody>
                    <tr className="border-b border-white/10">
                      <td className="px-3 py-2 text-white/60">Case</td>
                      <td className="px-3 py-2 font-mono">{angle.case}</td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="px-3 py-2 text-white/60">Classification</td>
                      <td className="px-3 py-2">
                        {angle.classification.value}
                        {angleMismatch ? (
                          <span className="ml-2 rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                            mismatch — labeled {selected?.angle}
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-white/45">
                            labeled {selected?.angle ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="px-3 py-2 text-white/60">Yaw</td>
                      <td className="px-3 py-2">
                        {angle.yaw.valid
                          ? `${angle.yaw.value.toFixed(1)}°`
                          : "—"}{" "}
                        <span className="text-white/45">
                          conf {angle.yaw.confidence.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="px-3 py-2 text-white/60">Λ (lambda)</td>
                      <td className="px-3 py-2">
                        {angle.lambda.valid
                          ? angle.lambda.value.toFixed(3)
                          : "—"}
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="px-3 py-2 text-white/60">Roll / pitch</td>
                      <td className="px-3 py-2">
                        {angle.roll.valid
                          ? `${angle.roll.value.toFixed(1)}°`
                          : "—"}{" "}
                        /{" "}
                        {angle.pitch.valid
                          ? `${angle.pitch.value.toFixed(1)}°`
                          : "—"}
                      </td>
                    </tr>
                    <tr className="border-b border-white/10">
                      <td className="px-3 py-2 text-white/60">Refuse</td>
                      <td className="px-3 py-2">
                        {!angle.valid ? (
                          <span className="text-[#f3c36a]">
                            refused ({angle.reason ?? "angle"})
                          </span>
                        ) : (
                          <span className="text-[#c8f542]">accepted</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-white/60">Runtime</td>
                      <td className="px-3 py-2">
                        {angle.elapsedMs.toFixed(2)} ms
                        <span className="ml-2 text-xs text-white/45">
                          (doc target &lt;15 ms on-device)
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Metrics</h2>
            {phases?.sloMoReexportedAt30.value ? (
              <p className="mt-2 rounded-xl border border-[#f3c36a]/40 bg-[#f3c36a]/10 px-4 py-3 text-sm font-medium text-[#f3c36a]">
                Slo-mo re-export detected — timing metrics invalid (
                {phases.sloMoReexportedAt30.reason ?? "near 30 fps"})
              </p>
            ) : null}
            {!faceOnMetrics && !dtlMetrics ? (
              <p className="mt-2 text-sm text-white/50">
                Run pose on /admin/test-set to compute metrics.
              </p>
            ) : (
              <>
                {faceOnMetrics ? (
                  <div
                    className={`mt-3 ${activeSet === "dtl" ? "opacity-40" : ""}`}
                  >
                    <h3 className="mb-2 text-sm font-medium text-white/70">
                      Face-on
                      {activeSet === "dtl" ? (
                        <span className="ml-2 text-xs text-white/45">
                          inactive for this angle
                        </span>
                      ) : null}
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="min-w-[760px] w-full text-left text-sm">
                        <thead className="bg-white/5 text-xs text-white/60">
                          <tr>
                            <th className="px-3 py-2 font-medium">Metric</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                            <th className="px-3 py-2 font-medium">Unit</th>
                            <th className="px-3 py-2 font-medium">Confidence</th>
                            <th className="px-3 py-2 font-medium">Valid</th>
                            <th className="px-3 py-2 font-medium">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FACE_ON_METRIC_ORDER.map((key) => {
                            const row = faceOnMetrics[key];
                            return (
                              <tr
                                key={key}
                                className={`border-t border-white/10 ${row.valid ? "" : "text-white/40"}`}
                              >
                                <td className="px-3 py-2 font-mono text-xs">
                                  {key}
                                </td>
                                <td className="px-3 py-2">
                                  {row.valid
                                    ? formatMetricValue(row.value, row.unit)
                                    : "—"}
                                </td>
                                <td className="px-3 py-2">{row.unit}</td>
                                <td className="px-3 py-2">
                                  {row.confidence.toFixed(2)}
                                </td>
                                <td className="px-3 py-2">
                                  {row.valid ? "yes" : "no"}
                                </td>
                                <td className="px-3 py-2 text-white/60">
                                  {row.reason ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                {dtlMetrics ? (
                  <div
                    className={`mt-4 ${activeSet === "face_on" ? "opacity-40" : ""}`}
                  >
                    <h3 className="mb-2 text-sm font-medium text-white/70">
                      DTL
                      {activeSet === "face_on" ? (
                        <span className="ml-2 text-xs text-white/45">
                          inactive for this angle
                        </span>
                      ) : null}
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="min-w-[760px] w-full text-left text-sm">
                        <thead className="bg-white/5 text-xs text-white/60">
                          <tr>
                            <th className="px-3 py-2 font-medium">Metric</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                            <th className="px-3 py-2 font-medium">Unit</th>
                            <th className="px-3 py-2 font-medium">Confidence</th>
                            <th className="px-3 py-2 font-medium">Valid</th>
                            <th className="px-3 py-2 font-medium">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DTL_METRIC_ORDER.map((key) => {
                            const row = dtlMetrics[key];
                            return (
                              <tr
                                key={key}
                                className={`border-t border-white/10 ${row.valid ? "" : "text-white/40"}`}
                              >
                                <td className="px-3 py-2 font-mono text-xs">
                                  {key}
                                </td>
                                <td className="px-3 py-2">
                                  {row.valid
                                    ? formatMetricValue(row.value, row.unit)
                                    : row.unit === "family_code"
                                      ? row.reason ?? "—"
                                      : "—"}
                                </td>
                                <td className="px-3 py-2">{row.unit}</td>
                                <td className="px-3 py-2">
                                  {row.confidence.toFixed(2)}
                                </td>
                                <td className="px-3 py-2">
                                  {row.valid ? "yes" : "no"}
                                </td>
                                <td className="px-3 py-2 text-white/60">
                                  {row.reason ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                {phases?.address.valid &&
                phases.top.valid &&
                phases.impact.valid &&
                selected.signed_url &&
                activeSet === "face_on" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MetricPhaseStill
                      label="Address"
                      videoSrc={selected.signed_url}
                      timeMs={phases.address.timeMs}
                      keypoints={keypoints}
                    />
                    <MetricPhaseStill
                      label="Top"
                      videoSrc={selected.signed_url}
                      timeMs={phases.top.timeMs}
                      keypoints={keypoints}
                    />
                    <MetricPhaseStill
                      label="Impact"
                      videoSrc={selected.signed_url}
                      timeMs={phases.impact.timeMs}
                      keypoints={keypoints}
                    />
                  </div>
                ) : null}
                {phases?.address.valid &&
                phases.top.valid &&
                phases.impact.valid &&
                selected.signed_url &&
                activeSet === "dtl" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <DtlMetricPhaseStill
                      label="Address"
                      videoSrc={selected.signed_url}
                      timeMs={phases.address.timeMs}
                      keypoints={keypoints}
                      tushLineX={tushLineAtAddress(
                        keypoints,
                        phases.address.frameIndex,
                        selected.handedness === "left" ? "left" : "right",
                      )}
                    />
                    <DtlMetricPhaseStill
                      label="Top"
                      videoSrc={selected.signed_url}
                      timeMs={phases.top.timeMs}
                      keypoints={keypoints}
                      tushLineX={tushLineAtAddress(
                        keypoints,
                        phases.address.frameIndex,
                        selected.handedness === "left" ? "left" : "right",
                      )}
                    />
                    <DtlMetricPhaseStill
                      label="Impact"
                      videoSrc={selected.signed_url}
                      timeMs={phases.impact.timeMs}
                      keypoints={keypoints}
                      tushLineX={tushLineAtAddress(
                        keypoints,
                        phases.address.frameIndex,
                        selected.handedness === "left" ? "left" : "right",
                      )}
                      wristPath={wristReconstruction}
                      impactFrameIndex={phases.impact.frameIndex}
                    />
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Frame rate</h2>
            <p className="mt-1 text-sm text-white/70">
              {selected.keypoints
                ? `effective ${Number(phases?.effectiveFrameRate.value ?? selected.keypoints.frame_rate_detected).toFixed(2)} fps vs labeled ${selected.frame_rate ?? "—"} · ${selected.keypoints.model_version}`
                : "Run pose on /admin/test-set first."}
            </p>
            {phases?.sloMoReexportedAt30.value ? (
              <p className="mt-1 text-sm text-[#f3c36a]">
                Slo-mo clip arrived near 30 fps
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Phases</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead className="bg-white/5 text-xs text-white/60">
                  <tr>
                    <th className="px-3 py-2 font-medium">Phase</th>
                    <th className="px-3 py-2 font-medium">Frame</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Confidence</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {!phases ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-white/45">
                        No phases yet.
                      </td>
                    </tr>
                  ) : (
                    phaseList(phases).map(({ key, mark }) => (
                      <tr key={key} className="border-t border-white/10">
                        <td className="px-3 py-2 capitalize">{key}</td>
                        <td className="px-3 py-2">
                          {mark.valid ? mark.frameIndex : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {mark.valid
                            ? `${(mark.timeMs / 1000).toFixed(3)}s`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {mark.confidence.toFixed(2)}
                          {mark.valid ? "" : " · invalid"}
                        </td>
                        <td className="px-3 py-2 text-white/60">
                          {mark.reason ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {phases ? (
              <p className="mt-2 text-xs text-white/50">
                Impact candidate: {phases.impactCandidate.value}
                {phases.impactCandidate.reason
                  ? ` · ${phases.impactCandidate.reason}`
                  : ""}
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Joint coverage</h2>
            <p className="mt-1 text-xs text-white/50">
              Percent of frames with visibility ≥ 0.5, plus the minimum
              visibility on that joint.
            </p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-[520px] w-full text-left text-sm">
                <thead className="bg-white/5 text-xs text-white/60">
                  <tr>
                    <th className="px-3 py-2 font-medium">Joint</th>
                    <th className="px-3 py-2 font-medium">% visible</th>
                    <th className="px-3 py-2 font-medium">Min visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-white/45">
                        No keypoints yet.
                      </td>
                    </tr>
                  ) : (
                    coverage.map((row) => (
                      <tr key={row.joint} className="border-t border-white/10">
                        <td className="px-3 py-2">
                          {row.name}
                          <span className="ml-2 text-xs text-white/40">
                            #{row.joint}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {Number(row.pctVisible).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2">
                          {Number(row.minVisibility).toFixed(3)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#101916] p-4">
            <h2 className="text-lg font-semibold">Phase 2e — ball & strike</h2>
            <p className="mt-1 text-sm text-white/55">
              Click the video to label ball box at current frame. Strike label
              requires capture_path + club_family on the swing row.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["center", "heel", "toe", "thin", "fat"] as const).map(
                (label) => (
                  <button
                    key={label}
                    type="button"
                    disabled={strikeLabelBusy}
                    onClick={() => void saveStrikeLabel(label)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      strikeLabel === label
                        ? "bg-[#c8f542] text-[#0b1210]"
                        : "bg-white/10 text-white/80"
                    }`}
                  >
                    {label}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={ballLabelBusy}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/70"
              >
                {ballLabelBusy ? "Saving ball…" : "Click video → ball box"}
              </button>
            </div>
            {strikeFeatures ? (
              <div className="mt-4">
                <p className="text-xs text-white/45">
                  Spectrogram (64-bin mel, normalized)
                  {strikeFeatures.reverberant ? " · reverberant" : ""}
                </p>
                <div className="mt-2 flex h-12 items-end gap-px">
                  {strikeFeatures.mel_spectrogram.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-[#c8f542]"
                      style={{ height: `${Math.max(4, v * 100)}%`, opacity: 0.35 + v * 0.65 }}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/50">
                  centroid {strikeFeatures.spectral_centroid_hz.toFixed(0)} Hz ·
                  roll-off {strikeFeatures.rolloff_85_hz.toFixed(0)} Hz · 2nd/1st{" "}
                  {strikeFeatures.second_10ms_ratio.toFixed(2)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/45">
                No strike_features — re-run pose on test-set to capture audio.
              </p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Diagnosis</h2>
            {diagnosis === null ? (
              <p className="mt-2 rounded-2xl border border-white/10 bg-[#101916] px-4 py-3 text-sm text-white/70">
                No diagnosis — select a swing with metrics.
              </p>
            ) : (
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#101916] p-4 text-xs text-white/70">
                {JSON.stringify(diagnosis, null, 2)}
              </pre>
            )}
          </section>
        </>
      )}
    </div>
  );
}
