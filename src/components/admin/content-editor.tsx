"use client";

import { useMemo, useState } from "react";
import {
  CheckboxInput,
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/admin/fields";
import { HistoryDrawer } from "@/components/admin/history-drawer";
import { saveCoachingVersion } from "@/lib/admin/actions";
import {
  ANGLES,
  BAND_RANGE_RULE,
  CLUB_FAMILIES,
  EXTERNAL_CUE_RULE,
  FAULT_TIERS,
  FEEL_CUE_MAX_WORDS,
  INTENTS,
  KIND_LABELS,
  PROTOCOL_BALLS,
  SYMPTOMS,
  UNITS,
  type ContentKind,
} from "@/lib/admin/constants";
import { validateFeelCue } from "@/lib/admin/feel-cue";
import {
  latestPerObject,
  payloadOf,
  type VersionedRow,
} from "@/lib/admin/versioning";

type MetricOption = { object_id: string; key: string; name: string };

const emptyDefaults: Record<ContentKind, Record<string, unknown>> = {
  metrics: {
    key: "",
    name: "",
    angle: "dtl",
    unit: "pct_stance",
    description: "",
    requires_club: false,
  },
  bands: {
    metric_object_id: "",
    club_family: "driver",
    intent: "stock",
    functional_low: "",
    functional_high: "",
    tolerance_beginner: "",
    tolerance_intermediate: "",
    tolerance_advanced: "",
  },
  faults: {
    key: "",
    name: "",
    family: "",
    tier: "setup",
    severity_weight: "",
    causal_leverage: "",
    changeability: "",
    metric_rules: "{}",
  },
  fault_families: {
    key: "",
    members: "",
    one_sentence: "",
  },
  symptom_map: {
    symptom: "slice",
    fault_key: "",
    weight: "",
    order: 1,
  },
  symptom_notes: {
    symptom: "slice",
    unseen_note: "",
  },
  voice: {
    fault_key: "",
    feel_cue: "",
    ball_flight_cost: "",
    explanation: "",
    signed_by: "",
    signed_at: "",
  },
  protocols: {
    fault_key: "",
    name: "",
    constraint_text: "",
    reps_slow: "",
    reps_rehearsal: "",
    reps_live: "",
    ball: "none",
    progression: "",
    success_criterion: "",
    demo_video_url: "",
  },
  setup_priority: {
    bullet_1: "",
    bullet_2: "",
    bullet_3: "",
    tier_weights: JSON.stringify(
      {
        setup: emptyTierWeights(),
        backswing: emptyTierWeights(),
        downswing: emptyTierWeights(),
        impact: emptyTierWeights(),
      },
      null,
      2,
    ),
  },
};

function emptyTierWeights() {
  return {
    ball_flight_relevance: null,
    confidence: null,
    severity: null,
    causal_leverage: null,
    changeability: null,
  };
}

function toFormPayload(kind: ContentKind, row: VersionedRow) {
  const payload = payloadOf(row);
  if (kind === "faults") {
    payload.metric_rules = JSON.stringify(payload.metric_rules ?? {}, null, 2);
  }
  if (kind === "fault_families") {
    payload.members = Array.isArray(payload.members)
      ? (payload.members as string[]).join("\n")
      : payload.members;
  }
  if (kind === "setup_priority") {
    payload.tier_weights = JSON.stringify(payload.tier_weights ?? {}, null, 2);
  }
  if (kind === "voice" && payload.signed_at) {
    payload.signed_at = String(payload.signed_at).slice(0, 16);
  }
  for (const key of Object.keys(payload)) {
    if (payload[key] === null) {
      payload[key] = "";
    }
  }
  return payload;
}

function labelFor(row: VersionedRow, kind: ContentKind) {
  if (typeof row.key === "string" && row.key) {
    return row.key;
  }
  if (typeof row.name === "string" && row.name) {
    return row.name;
  }
  if (kind === "bands") {
    return `${row.club_family} · ${row.intent}`;
  }
  if (kind === "voice" || kind === "protocols") {
    return String(row.fault_key || row.object_id);
  }
  if (kind === "symptom_map") {
    return `${row.symptom} → ${row.fault_key}`;
  }
  if (kind === "symptom_notes") {
    return String(row.symptom);
  }
  if (kind === "setup_priority") {
    return "Setup priority";
  }
  return row.object_id;
}

export function ContentEditor({
  kind,
  initialRows,
  publishedMetrics,
}: {
  kind: ContentKind;
  initialRows: VersionedRow[];
  publishedMetrics: MetricOption[];
}) {
  const [rows, setRows] = useState(initialRows);
  const latest = useMemo(() => latestPerObject(rows), [rows]);
  const [selectedId, setSelectedId] = useState<string | null>(
    latest[0]?.object_id ?? null,
  );
  const [form, setForm] = useState<Record<string, unknown>>(() =>
    latest[0] ? toFormPayload(kind, latest[0]) : { ...emptyDefaults[kind] },
  );
  const [draftObjectId, setDraftObjectId] = useState<string | null>(
    latest[0]?.object_id ?? null,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectedVersions = rows
    .filter((row) => row.object_id === draftObjectId)
    .sort((a, b) => b.version - a.version);
  const selectedLatest = selectedVersions[0] ?? null;

  const feelCue =
    kind === "voice" ? validateFeelCue(String(form.feel_cue ?? "")) : null;

  function setField(key: string, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectObject(objectId: string) {
    const match = latest.find((row) => row.object_id === objectId);
    if (!match) {
      return;
    }
    setSelectedId(objectId);
    setDraftObjectId(objectId);
    setForm(toFormPayload(kind, match));
    setMessage("");
  }

  function startNew() {
    const objectId = crypto.randomUUID();
    setSelectedId(null);
    setDraftObjectId(objectId);
    setForm({ ...emptyDefaults[kind] });
    setMessage("New object — save draft or publish to create v1.");
  }

  async function save(status: "draft" | "published") {
    if (!draftObjectId) {
      startNew();
      return;
    }
    if (kind === "voice" && feelCue && !feelCue.ok) {
      setMessage(`${feelCue.reason} ${feelCue.rule}`);
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await saveCoachingVersion(kind, draftObjectId, status, form);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const nextRow: VersionedRow = {
      ...form,
      id: result.id,
      object_id: draftObjectId,
      version: selectedLatest ? selectedLatest.version + 1 : 1,
      status,
      created_by: null,
      created_by_email: "you",
      created_at: new Date().toISOString(),
    };
    setRows((current) => [nextRow, ...current]);
    setSelectedId(draftObjectId);
    setMessage(
      status === "published"
        ? `Published v${nextRow.version} and wrote a content_versions snapshot.`
        : `Saved draft v${nextRow.version}.`,
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{KIND_LABELS[kind]}</h1>
        <p className="mt-1 text-sm text-white/55">
          Save inserts version+1. Publish demotes the previous published row and
          snapshots every published id.
        </p>
        {kind === "bands" ? (
          <p className="mt-2 text-sm text-[#c8f542]/80">{BAND_RANGE_RULE}</p>
        ) : null}
        {kind === "voice" ? (
          <p className="mt-2 text-sm text-[#c8f542]/80">{EXTERNAL_CUE_RULE}</p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#101916] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">Objects</h2>
          <button
            type="button"
            onClick={startNew}
            className="min-h-10 rounded-lg border border-white/15 px-3 text-sm"
          >
            New
          </button>
        </div>
        {latest.length === 0 ? (
          <p className="px-1 py-3 text-sm text-white/45">
            None yet
            {kind === "bands" || kind === "voice"
              ? " — empty on purpose. Do not invent numbers or cues."
              : "."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {latest.map((row) => (
              <li key={row.object_id}>
                <button
                  type="button"
                  onClick={() => selectObject(row.object_id)}
                  className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${
                    selectedId === row.object_id
                      ? "bg-[#c8f542]/15 text-white"
                      : "bg-white/5 text-white/80"
                  }`}
                >
                  <span className="truncate">{labelFor(row, kind)}</span>
                  <span className="ml-2 shrink-0 text-xs text-white/45">
                    v{row.version} · {row.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101916] p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white/80">
            {selectedLatest
              ? `Edit ${labelFor(selectedLatest, kind)}`
              : "New object"}
          </h2>
          <button
            type="button"
            disabled={!draftObjectId || selectedVersions.length === 0}
            onClick={() => setHistoryOpen(true)}
            className="min-h-10 rounded-lg border border-white/15 px-3 text-sm disabled:opacity-40"
          >
            History
          </button>
        </div>
        <KindFields
          kind={kind}
          form={form}
          setField={setField}
          publishedMetrics={publishedMetrics}
          feelCue={feelCue}
        />
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("draft")}
            className="min-h-12 flex-1 rounded-xl border border-white/20 px-4 font-semibold"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("published")}
            className="min-h-12 flex-1 rounded-xl bg-[#c8f542] px-4 font-semibold text-[#0b1210]"
          >
            Publish
          </button>
        </div>
        {message ? (
          <p
            className={`mt-3 text-sm ${
              message.includes("External-cue") ||
              message.includes("not") ||
              message.includes("must") ||
              message.includes("invalid")
                ? "text-red-300"
                : "text-[#c8f542]"
            }`}
          >
            {message}
          </p>
        ) : null}
      </section>

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        versions={selectedVersions}
      />
    </main>
  );
}

function KindFields({
  kind,
  form,
  setField,
  publishedMetrics,
  feelCue,
}: {
  kind: ContentKind;
  form: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  publishedMetrics: MetricOption[];
  feelCue: ReturnType<typeof validateFeelCue> | null;
}) {
  const value = (key: string) => String(form[key] ?? "");

  if (kind === "metrics") {
    return (
      <div className="grid gap-3">
        <Field label="Key">
          <TextInput
            value={value("key")}
            onChange={(event) => setField("key", event.target.value)}
          />
        </Field>
        <Field label="Name">
          <TextInput
            value={value("name")}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>
        <Field label="Angle">
          <SelectInput
            value={value("angle")}
            onChange={(event) => setField("angle", event.target.value)}
          >
            {ANGLES.map((angle) => (
              <option key={angle} value={angle}>
                {angle}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Unit">
          <SelectInput
            value={value("unit")}
            onChange={(event) => setField("unit", event.target.value)}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Description">
          <TextArea
            value={value("description")}
            onChange={(event) => setField("description", event.target.value)}
          />
        </Field>
        <CheckboxInput
          label="Requires club"
          checked={Boolean(form.requires_club)}
          onChange={(checked) => setField("requires_club", checked)}
        />
      </div>
    );
  }

  if (kind === "bands") {
    return (
      <div className="grid gap-3">
        <Field label="Metric">
          <SelectInput
            value={value("metric_object_id")}
            onChange={(event) =>
              setField("metric_object_id", event.target.value)
            }
          >
            <option value="">Select metric</option>
            {publishedMetrics.map((metric) => (
              <option key={metric.object_id} value={metric.object_id}>
                {metric.name} ({metric.key})
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Club family (6.9)">
          <SelectInput
            value={value("club_family")}
            onChange={(event) => setField("club_family", event.target.value)}
          >
            {CLUB_FAMILIES.map((club) => (
              <option key={club} value={club}>
                {club}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Intent (6.9)">
          <SelectInput
            value={value("intent")}
            onChange={(event) => setField("intent", event.target.value)}
          >
            {INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {intent}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Functional low">
          <TextInput
            inputMode="decimal"
            value={value("functional_low")}
            onChange={(event) => setField("functional_low", event.target.value)}
          />
        </Field>
        <Field label="Functional high">
          <TextInput
            inputMode="decimal"
            value={value("functional_high")}
            onChange={(event) =>
              setField("functional_high", event.target.value)
            }
          />
        </Field>
        <Field label="Tolerance beginner">
          <TextInput
            inputMode="decimal"
            value={value("tolerance_beginner")}
            onChange={(event) =>
              setField("tolerance_beginner", event.target.value)
            }
          />
        </Field>
        <Field label="Tolerance intermediate">
          <TextInput
            inputMode="decimal"
            value={value("tolerance_intermediate")}
            onChange={(event) =>
              setField("tolerance_intermediate", event.target.value)
            }
          />
        </Field>
        <Field label="Tolerance advanced">
          <TextInput
            inputMode="decimal"
            value={value("tolerance_advanced")}
            onChange={(event) =>
              setField("tolerance_advanced", event.target.value)
            }
          />
        </Field>
      </div>
    );
  }

  if (kind === "faults") {
    return (
      <div className="grid gap-3">
        <Field label="Key">
          <TextInput
            value={value("key")}
            onChange={(event) => setField("key", event.target.value)}
          />
        </Field>
        <Field label="Name">
          <TextInput
            value={value("name")}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>
        <Field label="Family">
          <TextInput
            value={value("family")}
            onChange={(event) => setField("family", event.target.value)}
          />
        </Field>
        <Field label="Tier">
          <SelectInput
            value={value("tier")}
            onChange={(event) => setField("tier", event.target.value)}
          >
            {FAULT_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Severity weight">
          <TextInput
            inputMode="decimal"
            value={value("severity_weight")}
            onChange={(event) =>
              setField("severity_weight", event.target.value)
            }
          />
        </Field>
        <Field label="Causal leverage">
          <TextInput
            inputMode="decimal"
            value={value("causal_leverage")}
            onChange={(event) =>
              setField("causal_leverage", event.target.value)
            }
          />
        </Field>
        <Field label="Changeability">
          <TextInput
            inputMode="decimal"
            value={value("changeability")}
            onChange={(event) => setField("changeability", event.target.value)}
          />
        </Field>
        <Field label="Metric rules (JSON)">
          <TextArea
            value={value("metric_rules")}
            onChange={(event) => setField("metric_rules", event.target.value)}
          />
        </Field>
      </div>
    );
  }

  if (kind === "fault_families") {
    return (
      <div className="grid gap-3">
        <Field label="Key">
          <TextInput
            value={value("key")}
            onChange={(event) => setField("key", event.target.value)}
          />
        </Field>
        <Field label="Members (one key per line)">
          <TextArea
            value={value("members")}
            onChange={(event) => setField("members", event.target.value)}
          />
        </Field>
        <Field label="One sentence">
          <TextArea
            value={value("one_sentence")}
            onChange={(event) => setField("one_sentence", event.target.value)}
          />
        </Field>
      </div>
    );
  }

  if (kind === "symptom_map") {
    return (
      <div className="grid gap-3">
        <Field label="Symptom (6.10)">
          <SelectInput
            value={value("symptom")}
            onChange={(event) => setField("symptom", event.target.value)}
          >
            {SYMPTOMS.map((symptom) => (
              <option key={symptom} value={symptom}>
                {symptom}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Fault key">
          <TextInput
            value={value("fault_key")}
            onChange={(event) => setField("fault_key", event.target.value)}
          />
        </Field>
        <Field label="Weight">
          <TextInput
            inputMode="decimal"
            value={value("weight")}
            onChange={(event) => setField("weight", event.target.value)}
          />
        </Field>
        <Field label="Order">
          <TextInput
            inputMode="numeric"
            value={value("order")}
            onChange={(event) => setField("order", event.target.value)}
          />
        </Field>
      </div>
    );
  }

  if (kind === "symptom_notes") {
    return (
      <div className="grid gap-3">
        <Field label="Symptom">
          <SelectInput
            value={value("symptom")}
            onChange={(event) => setField("symptom", event.target.value)}
          >
            {SYMPTOMS.map((symptom) => (
              <option key={symptom} value={symptom}>
                {symptom}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Unseen note (6.10)">
          <TextArea
            value={value("unseen_note")}
            onChange={(event) => setField("unseen_note", event.target.value)}
          />
        </Field>
      </div>
    );
  }

  if (kind === "voice") {
    const wordCount = feelCue?.wordCount ?? 0;
    return (
      <div className="grid gap-3">
        <Field label="Fault key">
          <TextInput
            value={value("fault_key")}
            onChange={(event) => setField("fault_key", event.target.value)}
          />
        </Field>
        <Field label={`Feel cue (${wordCount}/${FEEL_CUE_MAX_WORDS} words)`}>
          <TextInput
            value={value("feel_cue")}
            onChange={(event) => setField("feel_cue", event.target.value)}
          />
        </Field>
        {feelCue && !feelCue.ok ? (
          <p className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
            {feelCue.reason}
            <span className="mt-2 block text-red-100/80">{feelCue.rule}</span>
          </p>
        ) : null}
        <Field label="Ball-flight cost">
          <TextArea
            value={value("ball_flight_cost")}
            onChange={(event) =>
              setField("ball_flight_cost", event.target.value)
            }
          />
        </Field>
        <Field label="Explanation (may name the body)">
          <TextArea
            value={value("explanation")}
            onChange={(event) => setField("explanation", event.target.value)}
          />
        </Field>
        <Field label="Signed by">
          <TextInput
            value={value("signed_by")}
            onChange={(event) => setField("signed_by", event.target.value)}
          />
        </Field>
        <Field label="Signed at">
          <TextInput
            type="datetime-local"
            value={value("signed_at")}
            onChange={(event) => setField("signed_at", event.target.value)}
          />
        </Field>
      </div>
    );
  }

  if (kind === "protocols") {
    return (
      <div className="grid gap-3">
        <Field label="Fault key">
          <TextInput
            value={value("fault_key")}
            onChange={(event) => setField("fault_key", event.target.value)}
          />
        </Field>
        <Field label="Name">
          <TextInput
            value={value("name")}
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>
        <Field label="Constraint">
          <TextArea
            value={value("constraint_text")}
            onChange={(event) =>
              setField("constraint_text", event.target.value)
            }
          />
        </Field>
        <Field label="Reps slow">
          <TextInput
            inputMode="numeric"
            value={value("reps_slow")}
            onChange={(event) => setField("reps_slow", event.target.value)}
          />
        </Field>
        <Field label="Reps rehearsal">
          <TextInput
            inputMode="numeric"
            value={value("reps_rehearsal")}
            onChange={(event) => setField("reps_rehearsal", event.target.value)}
          />
        </Field>
        <Field label="Reps live">
          <TextInput
            inputMode="numeric"
            value={value("reps_live")}
            onChange={(event) => setField("reps_live", event.target.value)}
          />
        </Field>
        <Field label="Ball">
          <SelectInput
            value={value("ball")}
            onChange={(event) => setField("ball", event.target.value)}
          >
            {PROTOCOL_BALLS.map((ball) => (
              <option key={ball} value={ball}>
                {ball}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Progression">
          <TextArea
            value={value("progression")}
            onChange={(event) => setField("progression", event.target.value)}
          />
        </Field>
        <Field label="Success criterion">
          <TextArea
            value={value("success_criterion")}
            onChange={(event) =>
              setField("success_criterion", event.target.value)
            }
          />
        </Field>
        <Field label="Demo video URL">
          <TextInput
            value={value("demo_video_url")}
            onChange={(event) => setField("demo_video_url", event.target.value)}
          />
        </Field>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <Field label="Bullet 1 (6.4)">
        <TextArea
          value={value("bullet_1")}
          onChange={(event) => setField("bullet_1", event.target.value)}
        />
      </Field>
      <Field label="Bullet 2 (6.4)">
        <TextArea
          value={value("bullet_2")}
          onChange={(event) => setField("bullet_2", event.target.value)}
        />
      </Field>
      <Field label="Bullet 3 (6.4)">
        <TextArea
          value={value("bullet_3")}
          onChange={(event) => setField("bullet_3", event.target.value)}
        />
      </Field>
      <Field label="Per-tier weights (JSON, leave null until signed)">
        <TextArea
          value={value("tier_weights")}
          onChange={(event) => setField("tier_weights", event.target.value)}
        />
      </Field>
    </div>
  );
}
