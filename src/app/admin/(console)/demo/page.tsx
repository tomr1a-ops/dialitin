import { DemoRevealWorkspace } from "@/components/reveal/demo-reveal-workspace";
import { getG01DemoSession } from "@/lib/reveal/g01-demo";

export const dynamic = "force-dynamic";

export default async function AdminDemoPage() {
  const session = await getG01DemoSession();

  if (!session) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Reveal demo</h1>
        <p className="text-sm text-white/70">
          G01 test swing not found. Upload G01 via Test Set first.
        </p>
      </div>
    );
  }

  return <DemoRevealWorkspace session={session} />;
}
