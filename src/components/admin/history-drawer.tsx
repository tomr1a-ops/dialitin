import { diffPayloads, formatValue } from "@/lib/admin/diff";
import { payloadOf, type VersionedRow } from "@/lib/admin/versioning";

export function HistoryDrawer({
  open,
  onClose,
  versions,
}: {
  open: boolean;
  onClose: () => void;
  versions: VersionedRow[];
}) {
  if (!open) {
    return null;
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50">
      <button
        type="button"
        aria-label="Close history"
        className="h-full flex-1"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-[#101916] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Version history</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg px-3 text-sm text-white/70"
          >
            Close
          </button>
        </div>
        <ol className="mt-4 flex flex-col gap-4">
          {sorted.map((version, index) => {
            const previous = sorted[index + 1];
            const lines = previous
              ? diffPayloads(payloadOf(previous), payloadOf(version))
              : [];
            return (
              <li
                key={version.id}
                className="rounded-xl border border-white/10 p-3"
              >
                <p className="text-sm font-semibold text-white">
                  v{version.version} · {version.status}
                </p>
                <p className="text-xs text-white/50">
                  {version.created_by_email ?? "unknown"} ·{" "}
                  {new Date(version.created_at).toLocaleString()}
                </p>
                {previous ? (
                  <ul className="mt-2 space-y-1 text-xs text-white/75">
                    {lines.length === 0 ? (
                      <li>No payload changes vs v{previous.version}.</li>
                    ) : (
                      lines.map((line) => (
                        <li key={line.path}>
                          <span className="text-white/50">{line.path}:</span>{" "}
                          {formatValue(line.before)} → {formatValue(line.after)}
                        </li>
                      ))
                    )}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-white/50">First version.</p>
                )}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
