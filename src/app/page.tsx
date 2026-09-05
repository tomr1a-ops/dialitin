import Link from "next/link";
import { SupabasePublishableReady } from "@/components/supabase/publishable-ready";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <SupabasePublishableReady />
      <div className="flex w-full max-w-[22rem] flex-col items-center text-center">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-white">
          One Swing. One Problem. One Fix.
        </h1>
        <p className="mt-5 text-[0.95rem] leading-relaxed text-white/70">
          Upload your full swing and SwingRead tells you the #1 thing holding
          you back — and exactly how to fix it. No app. No subscription. Under a
          minute, on your phone.
        </p>
        <Link
          href="/capture"
          className="mt-10 flex min-h-12 w-full items-center justify-center rounded-full bg-[#c8f542] px-6 text-[1.05rem] font-semibold text-[#0b1210]"
        >
          Analyze My Swing Free
        </Link>
      </div>
    </main>
  );
}
