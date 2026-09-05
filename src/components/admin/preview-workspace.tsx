"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { SkeletonOverlay } from "@/components/pose/skeleton-overlay";
import type { TestSwingListItem } from "@/lib/admin/test-swings";
import { diagnose } from "@/lib/engine/diagnose";

const CONTENT_VERSION = "draft";

export function PreviewWorkspace({
  swings,
  selectedId,
}: {
  swings: TestSwingListItem[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const selected =
    swings.find((swing) => swing.id === selectedId) ?? swings[0] ?? null;
  const pose = selected?.keypoints ?? null;
  const diagnosis = useMemo(
    () => diagnose(pose?.keypoints ?? [], CONTENT_VERSION),
    [pose],
  );
  const keypoints = pose?.keypoints ?? [];
  const coverage = pose?.coverage ?? [];

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
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {selected.signed_url ? (
              <video
                ref={videoRef}
                className="aspect-video w-full object-contain"
                src={selected.signed_url}
                controls
                playsInline
                preload="auto"
              />
            ) : (
              <p className="p-6 text-sm text-white/50">No signed clip URL.</p>
            )}
            <SkeletonOverlay videoRef={videoRef} keypoints={keypoints} />
          </div>

          <section>
            <h2 className="text-lg font-semibold">Detected frame rate</h2>
            <p className="mt-1 text-sm text-white/70">
              {selected.keypoints
                ? `${Number(selected.keypoints.frame_rate_detected).toFixed(2)} fps · ${selected.keypoints.model_version}`
                : "Run pose on /admin/test-set first."}
            </p>
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

          <section>
            <h2 className="text-lg font-semibold">Diagnosis</h2>
            {diagnosis === null ? (
              <p className="mt-2 rounded-2xl border border-white/10 bg-[#101916] px-4 py-3 text-sm text-white/70">
                no engine yet
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
