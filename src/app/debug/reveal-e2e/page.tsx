import { notFound } from "next/navigation";
import { DemoRevealWorkspace } from "@/components/reveal/demo-reveal-workspace";
import { getG01DemoSession } from "@/lib/reveal/g01-demo";

export const dynamic = "force-dynamic";

/** Headless screenshot harness — dev always; production only with REVEAL_E2E=1. */
export default async function RevealE2EPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.REVEAL_E2E !== "1"
  ) {
    notFound();
  }

  const session = await getG01DemoSession();
  if (!session) {
    return <p data-testid="reveal-e2e-missing">G01 swing unavailable</p>;
  }

  return <DemoRevealWorkspace session={session} />;
}
