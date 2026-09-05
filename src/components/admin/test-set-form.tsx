"use client";

import { useMemo, useState } from "react";
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
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const emptyLabels = (): TestSwingLabels => ({
  golfer_label: "G01",
  club_family: "driver",
  intent: "stock",
  angle: "dtl",
  frame_rate: 30,
  camera_yaw_marker: 0,
  capture_path: "upload",
  consecutive_group: null,
  pro_label_fault_1: null,
  pro_label_fault_2: null,
  handedness: "right",
  notes: null,
});

type ClipDraft = {
  file: File;
  labels: TestSwingLabels;
};

export function TestSetForm({ swings }: { swings: TestSwingListItem[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<ClipDraft[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const defaultLabels = useMemo(() => emptyLabels(), []);

  function onFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }
    const next = Array.from(fileList).map((file, index) => ({
      file,
      labels: {
        ...defaultLabels,
        golfer_label: `G${String(index + 1).padStart(2, "0")}`,
      },
    }));
    setDrafts(next);
    setError("");
    setStatus("");
  }

  function updateDraft(index: number, patch: Partial<TestSwingLabels>) {
    setDrafts((current) =>
      current.map((draft, i) =>
        i === index
          ? { ...draft, labels: { ...draft.labels, ...patch } }
          : draft,
      ),
    );
  }

  function copyFirstToAll() {
    const first = drafts[0];
    if (!first) {
      return;
    }
    setDrafts((current) =>
      current.map((draft, index) => ({
        ...draft,
        labels: {
          ...first.labels,
          golfer_label: `G${String(index + 1).padStart(2, "0")}`,
        },
      })),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (drafts.length === 0) {
      setError("Choose one or more clips first.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createBrowserSupabaseClient();
    try {
      for (let i = 0; i < drafts.length; i++) {
        const draft = drafts[i]!;
        setStatus(`Uploading ${i + 1} of ${drafts.length}: ${draft.file.name}`);
        const signRes = await fetch("/api/admin/test-swings/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: draft.file.name,
            contentType: draft.file.type || "video/mp4",
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
          .uploadToSignedUrl(signJson.path, signJson.token, draft.file, {
            contentType: draft.file.type || "video/mp4",
          });
        if (uploaded.error) {
          throw new Error(uploaded.error.message);
        }
        const saveRes = await fetch("/api/admin/test-swings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storage_path: signJson.path,
            ...draft.labels,
          }),
        });
        const saveJson = (await saveRes.json()) as { error?: string };
        if (!saveRes.ok) {
          throw new Error(saveJson.error ?? "Could not save labels.");
        }
      }
      setDrafts([]);
      setStatus(
        `Uploaded ${drafts.length} clip${drafts.length === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-white/10 bg-[#101916] p-4"
      >
        <h2 className="text-lg font-semibold">Upload filming-day clips</h2>
        <p className="mt-1 text-sm text-white/55">
          Private bucket <code className="text-[#c8f542]">test-swings</code>.
          Signed URLs only. Set labels per clip before upload.
        </p>
        <div className="mt-4">
          <input
            type="file"
            accept="video/*"
            multiple
            disabled={busy}
            onChange={(event) => onFiles(event.target.files)}
            className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-[#c8f542] file:px-3 file:py-2 file:font-semibold file:text-[#0b1210]"
          />
        </div>
        {drafts.length > 1 ? (
          <button
            type="button"
            onClick={copyFirstToAll}
            className="mt-3 text-xs text-[#c8f542] underline"
          >
            Copy first-row labels to all (keeps G01, G02…)
          </button>
        ) : null}
        <div className="mt-4 flex flex-col gap-4">
          {drafts.map((draft, index) => (
            <fieldset
              key={`${draft.file.name}-${index}`}
              className="grid gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <legend className="px-1 text-xs text-white/50">
                {draft.file.name}
              </legend>
              <Field label="Golfer label">
                <TextInput
                  value={draft.labels.golfer_label}
                  onChange={(event) =>
                    updateDraft(index, { golfer_label: event.target.value })
                  }
                />
              </Field>
              <Field label="Club family">
                <SelectInput
                  value={draft.labels.club_family}
                  onChange={(event) =>
                    updateDraft(index, {
                      club_family: event.target
                        .value as TestSwingLabels["club_family"],
                    })
                  }
                >
                  {CLUB_FAMILIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Intent">
                <SelectInput
                  value={draft.labels.intent}
                  onChange={(event) =>
                    updateDraft(index, {
                      intent: event.target.value as TestSwingLabels["intent"],
                    })
                  }
                >
                  {INTENTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Angle">
                <SelectInput
                  value={draft.labels.angle}
                  onChange={(event) =>
                    updateDraft(index, {
                      angle: event.target.value as TestSwingLabels["angle"],
                    })
                  }
                >
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
                  step="0.01"
                  value={draft.labels.frame_rate}
                  onChange={(event) =>
                    updateDraft(index, {
                      frame_rate: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Camera yaw marker">
                <SelectInput
                  value={draft.labels.camera_yaw_marker}
                  onChange={(event) =>
                    updateDraft(index, {
                      camera_yaw_marker: Number(
                        event.target.value,
                      ) as TestSwingLabels["camera_yaw_marker"],
                    })
                  }
                >
                  {CAMERA_YAW_MARKERS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Capture path">
                <SelectInput
                  value={draft.labels.capture_path}
                  onChange={(event) =>
                    updateDraft(index, {
                      capture_path: event.target
                        .value as TestSwingLabels["capture_path"],
                    })
                  }
                >
                  {TEST_CAPTURE_PATHS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Handedness">
                <SelectInput
                  value={draft.labels.handedness}
                  onChange={(event) =>
                    updateDraft(index, {
                      handedness: event.target
                        .value as TestSwingLabels["handedness"],
                    })
                  }
                >
                  {HANDEDNESS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Consecutive group">
                <TextInput
                  value={draft.labels.consecutive_group ?? ""}
                  onChange={(event) =>
                    updateDraft(index, {
                      consecutive_group: event.target.value || null,
                    })
                  }
                />
              </Field>
              <Field label="Pro label fault 1">
                <TextInput
                  value={draft.labels.pro_label_fault_1 ?? ""}
                  onChange={(event) =>
                    updateDraft(index, {
                      pro_label_fault_1: event.target.value || null,
                    })
                  }
                />
              </Field>
              <Field label="Pro label fault 2">
                <TextInput
                  value={draft.labels.pro_label_fault_2 ?? ""}
                  onChange={(event) =>
                    updateDraft(index, {
                      pro_label_fault_2: event.target.value || null,
                    })
                  }
                />
              </Field>
              <Field label="Notes">
                <TextArea
                  value={draft.labels.notes ?? ""}
                  onChange={(event) =>
                    updateDraft(index, { notes: event.target.value || null })
                  }
                />
              </Field>
            </fieldset>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || drafts.length === 0}
          className="mt-4 min-h-11 rounded-xl bg-[#c8f542] px-4 font-semibold text-[#0b1210] disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload labeled clips"}
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
                  "Group",
                  "Fault 1",
                  "Fault 2",
                  "Notes",
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
                  <td colSpan={13} className="px-3 py-6 text-white/45">
                    No clips yet.
                  </td>
                </tr>
              ) : (
                swings.map((swing) => (
                  <tr key={swing.id} className="border-t border-white/10">
                    <td className="px-3 py-2 font-semibold text-[#c8f542]">
                      {swing.golfer_label}
                    </td>
                    <td className="px-3 py-2">{swing.club_family}</td>
                    <td className="px-3 py-2">{swing.intent}</td>
                    <td className="px-3 py-2">{swing.angle}</td>
                    <td className="px-3 py-2">{swing.frame_rate}</td>
                    <td className="px-3 py-2">{swing.camera_yaw_marker}</td>
                    <td className="px-3 py-2">{swing.capture_path}</td>
                    <td className="px-3 py-2">{swing.handedness}</td>
                    <td className="px-3 py-2">
                      {swing.consecutive_group ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {swing.pro_label_fault_1 ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {swing.pro_label_fault_2 ?? "—"}
                    </td>
                    <td className="max-w-48 truncate px-3 py-2">
                      {swing.notes ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {swing.signed_url ? (
                        <a
                          href={swing.signed_url}
                          className="text-[#c8f542] underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          signed
                        </a>
                      ) : (
                        "—"
                      )}
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
