import { listContentSnapshots } from "@/lib/admin/queries";

export default async function AdminSnapshotsPage() {
  const snapshots = await listContentSnapshots();
  return (
    <main>
      <h1 className="text-2xl font-semibold">Content snapshots</h1>
      <p className="mt-2 text-sm text-white/60">
        Publishing any object appends a row that pins the published version id
        of every coaching table.
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {snapshots.length === 0 ? (
          <li className="text-sm text-white/50">No snapshots yet.</li>
        ) : (
          snapshots.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-white/10 bg-[#101916] p-4"
            >
              <p className="text-sm font-semibold text-white">
                {row.created_by_email ?? "unknown"}
              </p>
              <p className="text-xs text-white/45">
                {new Date(row.created_at).toLocaleString()}
              </p>
              <pre className="mt-3 overflow-x-auto text-[11px] leading-relaxed text-white/70">
                {JSON.stringify(row.snapshot, null, 2)}
              </pre>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
