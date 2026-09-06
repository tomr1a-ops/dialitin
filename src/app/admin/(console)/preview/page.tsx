import { PreviewWorkspace } from "@/components/admin/preview-workspace";
import { computeSwingDiagnosis } from "@/lib/admin/preview-diagnosis";
import { listTestSwings } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ swing?: string }>;
}) {
  const params = await searchParams;
  const swings = await listTestSwings();
  const selectedId = params.swing ?? swings[0]?.id ?? null;
  const selected = swings.find((s) => s.id === selectedId) ?? swings[0] ?? null;
  const diagnosis = await computeSwingDiagnosis(selected);

  return (
    <main>
      <h1 className="text-2xl font-semibold">Preview</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
        Pick a test swing. Clip, phase ticks, impact still, metrics, and the
        Sec 6.4 rules-engine diagnosis object.
      </p>
      <div className="mt-6">
        <PreviewWorkspace
          swings={swings}
          selectedId={selectedId}
          diagnosis={diagnosis}
        />
      </div>
    </main>
  );
}
