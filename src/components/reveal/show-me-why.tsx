"use client";

import { useState } from "react";
import type { RevealInput } from "@/lib/reveal/types";

export function ShowMeWhy({
  input,
  mode: controlledMode,
  onModeChange,
  traceLowConfidence = false,
}: {
  input: RevealInput;
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
  const confidencePct = Math.round(metric.confidence * 100);

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
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-[#f3c36a]">
            {metric.label}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {metric.value.toFixed(0)}% of stance width
          </p>
          <p className="mt-2 text-sm text-white/70">{input.feelSentence}</p>
          {traceLowConfidence ? (
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[#f3c36a]/80">
              low confidence
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/80">
          <p>
            <span className="font-semibold text-white">Measured:</span>{" "}
            {metric.label} at {metric.value.toFixed(0)}% of stance width
            (band {metric.bandMin} to {metric.bandMax}%).
          </p>
          <p>
            <span className="font-semibold text-white">Confidence:</span>{" "}
            {confidencePct}%. {metric.reason}
          </p>
          {traceLowConfidence ? (
            <p>
              <span className="font-semibold text-white">Hand path:</span> low
              confidence — too many frames were occluded or rejected for a
              reliable trace.
            </p>
          ) : null}
          <p className="text-white/55">
            We measure you, not the stick. That&apos;s why this isn&apos;t
            guessing.
          </p>
        </div>
      )}
    </section>
  );
}
