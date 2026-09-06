"use client";

export function DidItWorkCapture({
  diagnosisId,
  onComplete,
}: {
  diagnosisId: string;
  onComplete?: () => void;
}) {
  async function submit(did_it_work: "better" | "same" | "worse" | "not_sure") {
    await fetch("/api/outcomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnosis_id: diagnosisId, did_it_work }),
    });
    onComplete?.();
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm font-semibold">Did your shot improve?</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(
          [
            ["better", "Yes"],
            ["worse", "No"],
            ["not_sure", "Not sure"],
            ["same", "Same"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="min-h-11 rounded-full border border-white/20 text-sm font-semibold text-white/80"
            onClick={() => submit(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function PaywallComing() {
  return (
    <section className="mt-6 rounded-2xl border border-[#c8f542]/30 bg-[#c8f542]/10 p-4 text-center">
      <p className="text-sm font-semibold text-[#c8f542]">
        Continue My Swing Fix
      </p>
      <p className="mt-2 text-sm text-white/70">
        Range Session, $9, coming soon. Your free diagnosis and retests are
        used.
      </p>
    </section>
  );
}
