import { PreviewWorkspace } from "@/components/admin/preview-workspace";
import { listTestSwings } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ swing?: string }>;
}) {
  const params = await searchParams;
  const swings = await listTestSwings();
  return (
    <main>
      <h1 className="text-2xl font-semibold">Preview</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
        Pick a test swing. Clip, phase ticks, impact still, effective vs labeled
        frame rate, and diagnose() — still a stub until the Sec 6.4 rules engine
        exists.
      </p>
      <div className="mt-6">
        <PreviewWorkspace
          swings={swings}
          selectedId={params.swing ?? swings[0]?.id ?? null}
        />
      </div>
    </main>
  );
}
