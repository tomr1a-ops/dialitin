"use client";

import { useState } from "react";
import { guiltyTimingReliabilityNote } from "@/lib/reveal/caption";
import {
  assertRevealInputConfidence,
  metricEligibleForReveal,
} from "@/lib/reveal/confidence-gate";
import { formatEngineReasonForDisplay } from "@/lib/reveal/reason-display";
import type { SwingPhases } from "@/lib/engine/phases";
import type { RevealInput } from "@/lib/reveal/types";

export function ShowMeWhy({
  input,
  phases,
  mode: controlledMode,
  onModeChange,
  traceLowConfidence = false,
}: {
  input: RevealInput;
  phases?: SwingPhases | null;
  mode?: "show" | "why";
  onModeChange?: (mode: "show" | "why") => void;
  traceLowConfidence?: boolean;
}) {
  const [internalMode, setInternalMode] = useState<"show" | "why">("show");
  const mode = controlledMode ?? internalMode;

  function setMode(next: "show" | "why") {
    if (onModeChange) {
      onModeChange(next);
    } else {
      setInternalMode(next);
    }
  }

  const { metric } = input;
  assertRevealInputConfidence(input);
  const showMetric = metricEligibleForReveal(input);
  const confidencePct = Math.round(metric.confidence * 100);
  const timingReliabilityNote = phases ? guiltyTimingReliabilityNote(phases) : null;
  const reasonText = formatEngineReasonForDisplay(metric.reason);

  return (
    <section data-testid="reveal-show-me-why">
      <div className="flex gap-2">
        <button
          type="button"
          className={`min-h-11 flex-1 rounded-full text-sm font-semibold ${
            mode === "show"
              ? "bg-[#c8f542] text-[#0b1210]"
              : "border border-white/20 text-white"
          }`}
          onClick={() => setMode("show")}
        >
          Show Me
        </button>
        <button
          type="button"
          className={`min-h-11 flex-1 rounded-full text-sm font-semibold ${
            mode === "why"
              ? "bg-[#c8f542] text-[#0b1210]"
              : "border border-white/20 text-white"
          }`}
          onClick={() => setMode("why")}
        >
          Why
        </button>
      </div>

      {mode === "show" ? (
        showMetric ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-[#f3c36a]">
            {metric.label}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {metric.value.toFixed(0)}% of stance width
          </p>
          <p className="mt-2 text-sm text-white/70">{input.feelSentence}</p>
          {timingReliabilityNote ? (
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[#f3c36a]/80">
              {timingReliabilityNote}
            </p>
          ) : null}
          {traceLowConfidence ? (
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[#f3c36a]/80">
              low confidence
            </p>
          ) : null}
        </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            {timingReliabilityNote ?? reasonText ?? input.feelSentence}
          </div>
        )
      ) : showMetric ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/80">
          <p>
            <span className="font-semibold text-white">Measured:</span>{" "}
            {metric.label} at {metric.value.toFixed(0)}% of stance width
            (band {metric.bandMin} to {metric.bandMax}%).
          </p>
          <p>
            <span className="font-semibold text-white">Confidence:</span>{" "}
            {confidencePct}%. {reasonText}
          </p>
          {timingReliabilityNote ? (
            <p>
              <span className="font-semibold text-white">Timing:</span>{" "}
              {timingReliabilityNote}
            </p>
          ) : null}
          {traceLowConfidence ? (
            <p>
              <span className="font-semibold text-white">Hand path:</span> low
              confidence. Too many frames were occluded or rejected for a
              reliable trace.
            </p>
          ) : null}
          <p className="text-white/55">
            We measure you, not the stick. That&apos;s why this isn&apos;t
            guessing.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/80">
          <p>{input.feelSentence || reasonText}</p>
        </div>
      )}
    </section>
  );
}
