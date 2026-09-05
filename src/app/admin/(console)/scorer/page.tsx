import { ScorerWorkspace } from "@/components/admin/scorer-workspace";
import { getScorerPageData } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminScorerPage() {
  const { result, latestRun, contentVersions } = await getScorerPageData();

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
    </main>
  );
}
