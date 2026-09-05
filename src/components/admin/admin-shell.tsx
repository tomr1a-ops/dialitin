import Link from "next/link";
import { signOutAdmin } from "@/lib/admin/actions";
import {
  CONTENT_KINDS,
  KIND_LABELS,
  KIND_TO_SLUG,
} from "@/lib/admin/constants";

export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#0b1210] text-[#f4f7f2]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1210]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <Link
              href="/admin/content"
              className="text-sm font-semibold tracking-wide text-[#c8f542]"
            >
              DialItIn admin
            </Link>
            <p className="text-xs text-white/50">{email}</p>
          </div>
          <form action={signOutAdmin}>
            <button
              type="submit"
              className="min-h-10 rounded-lg border border-white/15 px-3 text-sm text-white/80"
            >
              Sign out
            </button>
          </form>
        </div>
        <nav className="mx-auto mt-3 flex max-w-6xl gap-2 overflow-x-auto pb-1">
          {CONTENT_KINDS.map((kind) => (
            <Link
              key={kind}
              href={`/admin/content/${KIND_TO_SLUG[kind]}`}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/80"
            >
              {KIND_LABELS[kind]}
            </Link>
          ))}
          <Link
            href="/admin/content/snapshots"
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/80"
          >
            Snapshots
          </Link>
          <Link
            href="/admin/test-set"
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/80"
          >
            Test set
          </Link>
          <Link
            href="/admin/preview"
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/80"
          >
            Preview
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-5">{children}</div>
    </div>
  );
}
