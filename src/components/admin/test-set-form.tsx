"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLUB_FAMILIES, INTENTS } from "@/lib/admin/constants";
import {
  CAMERA_YAW_MARKERS,
  HANDEDNESS,
  TEST_CAPTURE_PATHS,
  TEST_SWING_ANGLES,
  TEST_SWING_BUCKET,
  type TestSwingLabels,
  type TestSwingListItem,
} from "@/lib/admin/test-swings";
import {
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/admin/fields";
import { estimateCameraAngle } from "@/lib/engine/angle";
import { computeFaceOnMetrics } from "@/lib/engine/metrics/faceOn";
import { detectVerticalRollFromClip } from "@/lib/engine/angle-capture";
import { ingestClip } from "@/lib/ingest/ingest-clip";
import { POSE_MODEL_VERSION } from "@/lib/pose/joints";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const emptyLabels = (): TestSwingLabels => ({
  golfer_label: "G01",
  club_family: "driver",
  intent: "stock",
  angle: "dtl",
  frame_rate: 30,
  camera_yaw_marker: 0,
  capture_path: "native_slomo",
  consecutive_group: null,
  pro_label_fault_1: null,
  pro_label_fault_2: null,
  handedness: "right",
  notes: null,
});

export function TestSetForm({ swings }: { swings: TestSwingListItem[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [labels, setLabels] = useState<TestSwingLabels>(emptyLabels);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  function patch(next: Partial<TestSwingLabels>) {
    setLabels((current) => ({ ...current, ...next }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a clip first.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createBrowserSupabaseClient();
    try {
      setStatus(`Uploading ${file.name}`);
      const signRes = await fetch("/api/admin/test-swings/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "video/mp4",
        }),
      });
      const signJson = (await signRes.json()) as {
        path?: string;
        token?: string;
        error?: string;
      };
      if (!signRes.ok || !signJson.path || !signJson.token) {
        throw new Error(signJson.error ?? "Could not sign upload.");
      }
      const uploaded = await supabase.storage
        .from(TEST_SWING_BUCKET)
        .uploadToSignedUrl(signJson.path, signJson.token, file, {
          contentType: file.type || "video/mp4",
        });
      if (uploaded.error) {
        throw new Error(uploaded.error.message);
      }
      const saveRes = await fetch("/api/admin/test-swings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: signJson.path,
          ...labels,
        }),
      });
      const saveJson = (await saveRes.json()) as { error?: string };
      if (!saveRes.ok) {
        throw new Error(saveJson.error ?? "Could not save labels.");
      }
      setFile(null);
      setStatus("Uploaded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runPose(swing: TestSwingListItem) {
    if (!swing.signed_url) {
      setError(`No signed URL for ${swing.golfer_label ?? swing.id}.`);
      return;
    }
    setRunningId(swing.id);
    setError("");
    setStatus(
      `Running pose + swing finder on ${swing.golfer_label ?? "clip"}…`,
    );
    try {
      const response = await fetch(swing.signed_url);
      if (!response.ok) {
        throw new Error("Could not download clip.");
      }
      const clip = new Blob([await response.arrayBuffer()], {
        type: "video/mp4",
      });
      const result = await ingestClip(clip, {
        capturePath: swing.capture_path === "in_app" ? "in-app" : "upload",
        fileName: swing.storage_path,
        handedness: swing.handedness ?? "right",
        labeledFrameRate: swing.frame_rate,
        orientationSamples: [],
      });
      const verticalRoll =
        result.phases.address.valid
          ? await detectVerticalRollFromClip(
              clip,
              result.phases.address.timeMs,
            )
          : null;
      const angleResult = estimateCameraAngle({
        frames: result.keypoints,
        phases: result.phases,
        imageWidth: result.resolution.width,
        imageHeight: result.resolution.height,
        capturePath: swing.capture_path,
        orientationSamples: result.orientationSamples,
        verticalRoll,
        handedness: swing.handedness ?? "right",
      });
      const metrics = computeFaceOnMetrics({
        frames: result.keypoints,
        normalizedFrames: angleResult.normalizedFrames,
        phases: result.phases,
        angle: angleResult.angle,
        handedness: swing.handedness ?? "right",
        clubFamily: swing.club_family,
        intent: swing.intent,
      });
      console.info(
        `[dialitin] angle-estimate ${angleResult.angle.elapsedMs.toFixed(2)}ms case=${angleResult.angle.case} valid=${angleResult.angle.valid}`,
      );
      const save = await fetch(`/api/admin/test-swings/${swing.id}/pose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_version: POSE_MODEL_VERSION,
          frame_rate_detected: result.detectedFrameRate,
          frames: result.keypoints,
          phases: result.phases,
          angle: angleResult.angle,
          normalized_keypoints: angleResult.normalizedFrames,
          metrics,
          handedness: swing.handedness ?? "right",
          club_family: swing.club_family,
          intent: swing.intent,
          orientation:
            result.orientationSamples.length > 0
              ? result.orientationSamples
              : null,
        }),
      });
      const json = (await save.json()) as { error?: string };
      if (!save.ok) {
        throw new Error(json.error ?? "Could not save keypoints.");
      }
      setStatus("Pose saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pose failed.");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-white/10 bg-[#101916] p-4"
      >
        <h2 className="text-lg font-semibold">Upload a filming-day clip</h2>
        <p className="mt-1 text-sm text-white/55">
          Private bucket <code className="text-[#c8f542]">test-swings</code>.
          Capture path is in-app or native Slo-mo (Rev 27 §5.3).
        </p>
        <div className="mt-4">
          <input
            type="file"
            accept="video/*"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-[#c8f542] file:px-3 file:py-2 file:font-semibold file:text-[#0b1210]"
          />
        </div>
        <fieldset className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Golfer label">
            <TextInput
              value={labels.golfer_label ?? ""}
              onChange={(event) => patch({ golfer_label: event.target.value })}
            />
          </Field>
          <Field label="Club family">
            <SelectInput
              value={labels.club_family ?? ""}
              onChange={(event) =>
                patch({
                  club_family: (event.target.value ||
                    null) as TestSwingLabels["club_family"],
                })
              }
            >
              <option value="">—</option>
              {CLUB_FAMILIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Intent">
            <SelectInput
              value={labels.intent ?? ""}
              onChange={(event) =>
                patch({
                  intent: (event.target.value ||
                    null) as TestSwingLabels["intent"],
                })
              }
            >
              <option value="">—</option>
              {INTENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Angle">
            <SelectInput
              value={labels.angle ?? ""}
              onChange={(event) =>
                patch({
                  angle: (event.target.value ||
                    null) as TestSwingLabels["angle"],
                })
              }
            >
              <option value="">—</option>
              {TEST_SWING_ANGLES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Frame rate">
            <TextInput
              type="number"
              min={1}
              max={480}
              value={labels.frame_rate ?? ""}
              onChange={(event) =>
                patch({
                  frame_rate: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </Field>
          <Field label="Camera yaw marker">
            <SelectInput
              value={labels.camera_yaw_marker ?? ""}
              onChange={(event) =>
                patch({
                  camera_yaw_marker: event.target.value
                    ? (Number(
                        event.target.value,
                      ) as TestSwingLabels["camera_yaw_marker"])
                    : null,
                })
              }
            >
              <option value="">—</option>
              {CAMERA_YAW_MARKERS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Capture path">
            <SelectInput
              value={labels.capture_path ?? ""}
              onChange={(event) =>
                patch({
                  capture_path: (event.target.value ||
                    null) as TestSwingLabels["capture_path"],
                })
              }
            >
              <option value="">—</option>
              {TEST_CAPTURE_PATHS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Handedness">
            <SelectInput
              value={labels.handedness ?? ""}
              onChange={(event) =>
                patch({
                  handedness: (event.target.value ||
                    null) as TestSwingLabels["handedness"],
                })
              }
            >
              <option value="">—</option>
              {HANDEDNESS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Consecutive group">
            <TextInput
              value={labels.consecutive_group ?? ""}
              onChange={(event) =>
                patch({ consecutive_group: event.target.value || null })
              }
            />
          </Field>
          <Field label="Pro label fault 1">
            <TextInput
              value={labels.pro_label_fault_1 ?? ""}
              onChange={(event) =>
                patch({ pro_label_fault_1: event.target.value || null })
              }
            />
          </Field>
          <Field label="Pro label fault 2">
            <TextInput
              value={labels.pro_label_fault_2 ?? ""}
              onChange={(event) =>
                patch({ pro_label_fault_2: event.target.value || null })
              }
            />
          </Field>
          <Field label="Notes">
            <TextArea
              value={labels.notes ?? ""}
              onChange={(event) => patch({ notes: event.target.value || null })}
            />
          </Field>
        </fieldset>
        <button
          type="submit"
          disabled={busy || !file}
          className="mt-4 min-h-11 rounded-xl bg-[#c8f542] px-4 font-semibold text-[#0b1210] disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload clip"}
        </button>
        {status ? (
          <p className="mt-3 text-sm text-[#c8f542]">{status}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </form>

      <section>
        <h2 className="text-lg font-semibold">Test set</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1100px] w-full text-left text-xs">
            <thead className="bg-white/5 text-white/60">
              <tr>
                {[
                  "Golfer",
                  "Club",
                  "Intent",
                  "Angle",
                  "FPS",
                  "Yaw",
                  "Path",
                  "Hand",
                  "Pose",
                  "Clip",
                ].map((header) => (
                  <th key={header} className="px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {swings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-white/45">
                    No clips yet.
                  </td>
                </tr>
              ) : (
                swings.map((swing) => (
                  <tr key={swing.id} className="border-t border-white/10">
                    <td className="px-3 py-2 font-semibold text-[#c8f542]">
                      {swing.golfer_label ?? "—"}
                    </td>
                    <td className="px-3 py-2">{swing.club_family ?? "—"}</td>
                    <td className="px-3 py-2">{swing.intent ?? "—"}</td>
                    <td className="px-3 py-2">{swing.angle ?? "—"}</td>
                    <td className="px-3 py-2">{swing.frame_rate ?? "—"}</td>
                    <td className="px-3 py-2">
                      {swing.camera_yaw_marker ?? "—"}
                    </td>
                    <td className="px-3 py-2">{swing.capture_path ?? "—"}</td>
                    <td className="px-3 py-2">{swing.handedness ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={runningId === swing.id}
                        onClick={() => void runPose(swing)}
                        className="rounded-lg bg-[#c8f542] px-2 py-1 font-semibold text-[#0b1210] disabled:opacity-50"
                      >
                        {runningId === swing.id ? "Running…" : "Run pose"}
                      </button>
                      {swing.keypoints ? (
                        <span className="ml-2 text-white/45">
                          {swing.keypoints.keypoints.length} frames
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`/admin/preview?swing=${swing.id}`}
                        className="text-[#c8f542] underline"
                      >
                        preview
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
