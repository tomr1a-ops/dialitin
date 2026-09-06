"use client";

import Link from "next/link";
import { useState } from "react";
import { FixScreen } from "@/components/reveal/fix-screen";
import {
  loadRevealSession,
} from "@/lib/reveal/reveal-session-storage";

export function FixView() {
  const [session] = useState(() => loadRevealSession());

  if (!session) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[22rem] flex-col justify-center px-5 py-8">
        <p className="text-sm text-white/70">
          No diagnosis in this session yet. Analyze a swing first.
        </p>
        <Link
          href="/capture"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#c8f542] px-6 text-sm font-semibold text-[#0b1210]"
        >
          Capture a swing
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[22rem] px-5 py-8">
      <Link href="/reveal" className="text-sm text-white/55">
        ← Reveal
      </Link>
      <div className="mt-4">
        <FixScreen
          input={session.input}
          isFirstResult={session.isFirstResult ?? false}
        />
      </div>
    </main>
  );
}
