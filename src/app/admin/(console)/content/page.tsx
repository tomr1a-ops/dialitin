import Link from "next/link";
import {
  BAND_RANGE_RULE,
  CONTENT_KINDS,
  KIND_LABELS,
  KIND_TO_SLUG,
} from "@/lib/admin/constants";

export default function AdminContentIndexPage() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Coaching data</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">
        Versioned catalog the engine will read. Saves insert a new row. Publish
        pins a content_versions snapshot. {BAND_RANGE_RULE}
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {CONTENT_KINDS.map((kind) => (
          <li key={kind}>
            <Link
              href={`/admin/content/${KIND_TO_SLUG[kind]}`}
              className="block rounded-2xl border border-white/10 bg-[#101916] px-4 py-4 text-white"
            >
              <span className="text-base font-semibold">
                {KIND_LABELS[kind]}
              </span>
              <span className="mt-1 block text-xs text-white/45">
                /admin/content/{KIND_TO_SLUG[kind]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
