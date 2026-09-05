"use client";

import { useEffect, useState } from "react";
import { createPoseRuntime } from "@/lib/pose/pose-runtime";
import { formatPoseStatus, type PoseStatus } from "@/lib/pose/status";

export default function PosePathPage() {
  const [status, setStatus] = useState<PoseStatus | null>({
    phase: "loading-model",
    loadedBytes: 0,
    totalBytes: 1,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    void (async () => {
      try {
        const started = await createPoseRuntime({
          onModelProgress(loadedBytes, totalBytes) {
            if (!closed) {
              setStatus({ phase: "loading-model", loadedBytes, totalBytes });
            }
          },
        });
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx?.fillRect(0, 0, 256, 256);
        const bitmap = await createImageBitmap(canvas);
        await started.runtime.detect(bitmap, 1);
        started.runtime.close();
        if (!closed) {
          setStatus({ phase: "done", path: started.path });
        }
      } catch (caught) {
        if (!closed) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setStatus(null);
        }
      }
    })();
    return () => {
      closed = true;
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <p
        data-pose-status={status?.phase ?? "error"}
        className="text-sm text-white/80"
      >
        {status ? formatPoseStatus(status) : error}
      </p>
      {error ? (
        <p data-pose-error="1" className="mt-3 text-sm text-[#f3c36a]">
          {error}
        </p>
      ) : null}
    </main>
  );
}
