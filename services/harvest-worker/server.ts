/**
 * Railway harvest worker — POST /harvest/run (Bearer HARVEST_WORKER_SECRET).
 * Run from monorepo root: npm run harvest:worker
 */
import express from "express";
import { runFullHarvest, type HarvestRunReport } from "@/lib/harvest/run-full";

const app = express();
app.use(express.json({ limit: "1mb" }));

function getWorkerSecret(): string | null {
  return process.env.HARVEST_WORKER_SECRET?.trim() || null;
}

function isAuthorized(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  return authHeader.slice("Bearer ".length) === secret;
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/harvest/run", async (request, response) => {
  const secret = getWorkerSecret();
  if (!secret) {
    response.status(503).json({ error: "HARVEST_WORKER_SECRET is not configured." });
    return;
  }
  if (!isAuthorized(request.headers.authorization, secret)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = (request.body ?? {}) as {
    seed?: boolean;
    base?: string;
    maxBatch?: number;
  };

  let report: HarvestRunReport;
  try {
    report = await runFullHarvest({
      siteBase: body.base,
      shouldSeed: body.seed ?? true,
      maxBatch: body.maxBatch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Harvest run failed.";
    response.status(500).json({ error: message });
    return;
  }

  response.json(report);
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`harvest-worker listening on :${port}`);
});
