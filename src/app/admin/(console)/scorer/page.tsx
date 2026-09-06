import { ScorerWorkspace } from "@/components/admin/scorer-workspace";
import { computeSwingDiagnosis } from "@/lib/admin/preview-diagnosis";
import { getScorerPageData, listTestSwings } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminScorerPage() {
  const { result, latestRun, contentVersions } = await getScorerPageData();
  const swings = await listTestSwings();
  const g01 = swings.find((s) => s.golfer_label === "G01") ?? null;
  const g01Diagnosis = await computeSwingDiagnosis(g01);

  return (
    <main>
      <h1 className="text-2xl font-semibold">Test-set scorer</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">
        Runs every test clip with stored keypoints through phases → angle →
        metrics → evaluate against the chosen content version. Re-run all
        recomputes stored phases, angle, and metrics with the current engine —
        no manual Run pose.
      </p>
      <div className="mt-6">
        <ScorerWorkspace
          initialResult={result}
          contentVersionId={
            result?.summary.contentVersionId ??
            contentVersions[0]?.id ??
            null
          }
          latestRunAt={latestRun?.created_at ?? null}
        />
      </div>
      {g01Diagnosis ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">G01 diagnosis object</h2>
          <pre className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#101916] p-4 text-xs text-white/70">
            {JSON.stringify(g01Diagnosis, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
