import { TestSetForm } from "@/components/admin/test-set-form";
import { listTestSwings } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminTestSetPage() {
  const swings = await listTestSwings();
  return (
    <main>
      <h1 className="text-2xl font-semibold">Test set</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
        Filming-day clips with anonymous golfer labels. These are evaluation
        data, not coaching content — no versioning. Used by /admin/preview to
        ask what a content version would have diagnosed.
      </p>
      <div className="mt-6">
        <TestSetForm swings={swings} />
      </div>
    </main>
  );
}
