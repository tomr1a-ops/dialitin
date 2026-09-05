"use client";

import { useState } from "react";
import { requestAdminMagicLink } from "@/lib/admin/actions";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const result = await requestAdminMagicLink(email);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#101916] p-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-[#c8f542]/80 uppercase">
          DialItIn admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          Coaching data
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Magic link for the single admin role. Not shown on the golfer landing,
          capture, or reveal.
        </p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <label className="text-sm text-white/80" htmlFor="admin-email">
            Admin email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-12 rounded-xl border border-white/15 bg-[#0b1210] px-3 text-white"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="min-h-12 rounded-xl bg-[#c8f542] px-4 text-base font-semibold text-[#0b1210] disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
        </form>
        {status === "sent" ? (
          <p className="mt-4 text-sm text-[#c8f542]">
            Check your email. The link returns to /admin.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      </div>
    </main>
  );
}
