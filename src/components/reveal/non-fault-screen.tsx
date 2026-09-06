import Link from "next/link";
import type { RevealInput } from "@/lib/reveal/types";

export function NonFaultRevealScreen({ input }: { input: RevealInput }) {
  const isFunctional = input.outcome === "dont_fix_it";
  const title = isFunctional
    ? "Your swing looks functional"
    : "Not enough signal";
  const body =
    input.headline ||
    input.feelSentence ||
    (isFunctional
      ? "We don't see a body-movement problem strong enough to recommend changing."
      : "We couldn't read this clip reliably enough to name a fault. Film again with the setup guide.");

  return (
    <section
      className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5"
      data-testid="reveal-non-fault"
      data-outcome={input.outcome ?? "unknown"}
    >
      <h2 className="text-[1.35rem] font-semibold tracking-tight">{title}</h2>
      <p className="text-sm leading-relaxed text-white/75">{body}</p>
      {!isFunctional ? (
        <Link
          href="/capture"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#c8f542] px-5 text-sm font-semibold text-[#0b1210]"
        >
          Re-film with setup guide
        </Link>
      ) : null}
    </section>
  );
}
