import { execFileSync } from "node:child_process";
import WebSocket from "ws";
import { runScorer } from "../src/lib/admin/scorer";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof WebSocket;
}

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

async function main() {
  const result = await runScorer({
    engineGitSha: gitSha(),
    persist: true,
  });

  console.log("\n=== Scorer summary ===");
  console.log(
    `${result.summary.clipsAllPhasesCorrect}/${result.summary.clipsTotal} clips all phases correct; ` +
      `${result.summary.metricsWithinTolerance}/${result.summary.metricsEvaluated} metrics within tolerance; ` +
      `${result.summary.angleMismatches} angle mismatches`,
  );
  console.log(`content version: ${result.summary.contentVersionId ?? "none"}`);
  console.log(`engine git SHA: ${result.summary.engineGitSha}`);

  console.log("\n=== Scorer table ===");
  for (const row of result.rows) {
    const phaseBits = Object.entries(row.phases)
      .map(([name, cell]) => `${name}:${cell.status}`)
      .join(" ");
    const metricBits = Object.entries(row.metrics)
      .map(([name, cell]) => `${name}:${cell.status}`)
      .join(" ");
    console.log(
      `${row.label} | angle ${row.detectedAngle}${row.angleMismatch ? " MISMATCH" : ""} | ${phaseBits} | ${metricBits}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
