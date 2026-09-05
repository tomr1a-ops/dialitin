import { PreviewWorkspace } from "@/components/admin/preview-workspace";
import {
  listContentSnapshots,
  listKeypointsBySwing,
  listTestSwings,
} from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminPreviewPage() {
  const [swings, snapshots] = await Promise.all([
    listTestSwings(),
    listContentSnapshots(),
  ]);
  const keypointsBySwing = await listKeypointsBySwing(
    swings.map((row) => row.id),
  );
  const publishedVersionId = snapshots[0]?.id ?? null;

  return (
    <main>
      <h1 className="text-2xl font-semibold">Preview</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
        What would this content version have diagnosed. Pose runs in the admin
        browser with the same Phase 0 pipeline as golfer capture. The engine is
        still a stub.
      </p>
      <div className="mt-6">
        <PreviewWorkspace
          swings={swings}
          keypointsBySwing={keypointsBySwing}
          publishedVersionId={publishedVersionId}
        />
      </div>
    </main>
  );
}
