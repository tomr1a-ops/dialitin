"use client";

import { useEffect, useState } from "react";
import { RevealView } from "@/components/reveal/reveal-view";
import { runInAppPipelineSelftest } from "@/lib/capture/selftest";
import { setCaptureSession } from "@/lib/capture/session";

export default function SelftestPage() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await runInAppPipelineSelftest();
        if (cancelled) {
          return;
        }
        setCaptureSession(result);
        setReady(true);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Self-test failed.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-center text-sm text-[#f3c36a]">{error}</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-white/70">Running in-app pipeline self-test…</p>
      </main>
    );
  }

  return <RevealView />;
}
