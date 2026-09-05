"use client";

import { useMemo } from "react";
import { handCentroidSeries } from "@/lib/engine/phases";
import type { PhaseMark, SwingPhases } from "@/lib/engine/phases";
import type { PoseFrame } from "@/lib/pose/types";

const PHASE_COLORS: Record<string, string> = {
  address: "#7dd3fc",
  takeaway: "#a3e635",
  top: "#c8f542",
  impact: "#f97316",
  finish: "#f472b6",
};

function phaseTicks(phases: SwingPhases) {
  return (
    [
      ["address", phases.address],
      ["takeaway", phases.takeaway],
      ["top", phases.top],
      ["impact", phases.impact],
      ["finish", phases.finish],
    ] as const
  ).filter(([, mark]) => mark.valid);
}

export function PhaseDiagnosticChart({
  keypoints,
  phases,
  handedness = "right",
  durationSeconds,
}: {
  keypoints: PoseFrame[];
  phases: SwingPhases | null;
  handedness?: "right" | "left";
  durationSeconds: number;
}) {
  const series = useMemo(
    () => handCentroidSeries(keypoints, handedness),
    [keypoints, handedness],
  );

  if (series.times.length < 2) {
    return (
      <p className="mt-2 text-sm text-white/50">
        Not enough keypoints for phase diagnostics.
      </p>
    );
  }

  const width = 720;
  const height = 180;
  const pad = { top: 16, right: 12, bottom: 28, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = (height - pad.top - pad.bottom) / 2 - 6;
  const durationMs = Math.max(durationSeconds * 1000, series.times.at(-1) ?? 1);

  const maxSpeed = Math.max(...series.speed, 0.001);
  const maxHeight = Math.max(...series.height, 0.001);

  const x = (timeMs: number) => pad.left + (timeMs / durationMs) * plotW;
  const yHeight = (value: number, row: number) =>
    pad.top + row * (plotH + 12) + plotH - (value / maxHeight) * plotH;
  const ySpeed = (value: number, row: number) =>
    pad.top + row * (plotH + 12) + plotH - (value / maxSpeed) * plotH;

  const heightPath = series.times
    .map((time, index) => {
      const px = x(time);
      const py = yHeight(series.height[index]!, 0);
      return `${index === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(" ");

  const speedPath = series.times
    .map((time, index) => {
      const px = x(time);
      const py = ySpeed(series.speed[index]!, 1);
      return `${index === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(" ");

  const ticks = phases ? phaseTicks(phases) : [];

  function tickLine(name: string, mark: PhaseMark) {
    const px = x(mark.timeMs);
    const color = PHASE_COLORS[name] ?? "#fff";
    return (
      <g key={name}>
        <line
          x1={px}
          x2={px}
          y1={pad.top}
          y2={pad.top + plotH * 2 + 12}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.85}
        />
        <text
          x={px}
          y={height - 6}
          textAnchor="middle"
          fill={color}
          fontSize={9}
          fontFamily="monospace"
        >
          {name}
        </text>
      </g>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#0b1210] p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[480px]"
        role="img"
        aria-label="Hand centroid height and speed with phase ticks"
      >
        <text x={pad.left} y={pad.top + 10} fill="#94a3b8" fontSize={10}>
          hand height (y inverted)
        </text>
        <text
          x={pad.left}
          y={pad.top + plotH + 22}
          fill="#94a3b8"
          fontSize={10}
        >
          hand speed
        </text>
        <path
          d={heightPath}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={1.5}
        />
        <path d={speedPath} fill="none" stroke="#fbbf24" strokeWidth={1.5} />
        {ticks.map(([name, mark]) => tickLine(name, mark))}
      </svg>
    </div>
  );
}
