import Link from "next/link";
import { signOutAdmin } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default function AdminUnauthorizedPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#101916] p-6">
        <h1 className="text-2xl font-semibold text-white">Not an admin</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          This account signed in, but it is not on the admin_users list. The
          seed is still waiting for Tom&apos;s email.
        </p>
        <form action={signOutAdmin} className="mt-6">
          <button
            type="submit"
            className="min-h-12 w-full rounded-xl bg-white/10 px-4 font-semibold text-white"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/"
          className="mt-4 block text-center text-sm text-white/50 underline"
        >
          Back to SwingRead
        </Link>
      </div>
    </main>
  );
}
