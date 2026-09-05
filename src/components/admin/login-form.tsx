"use client";

import { useState } from "react";
import {
  requestAdminEmailOtp,
  verifyAdminEmailOtp,
} from "@/lib/admin/actions";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "verifying" | "error"
  >("idle");
  const [error, setError] = useState("");

  async function onSend(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const result = await requestAdminEmailOtp(email);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("sent");
  }

  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    setStatus("verifying");
    setError("");
    const result = await verifyAdminEmailOtp(email, code);
    if (result && !result.ok) {
      setStatus("error");
      setError(result.error);
    }
  }

  const showCodeField =
    status === "sent" || status === "verifying" || Boolean(code);

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
          We email a 6-digit code to the single admin role. Type the code here —
          there is no link to click. Not shown on the golfer landing, capture,
          or reveal.
        </p>
        <form onSubmit={onSend} className="mt-6 flex flex-col gap-3">
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
            disabled={status === "sending" || status === "verifying"}
            className="min-h-12 rounded-xl bg-[#c8f542] px-4 text-base font-semibold text-[#0b1210] disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : "Send code"}
          </button>
        </form>
        {showCodeField ? (
          <form onSubmit={onVerify} className="mt-6 flex flex-col gap-3">
            <label className="text-sm text-white/80" htmlFor="admin-otp">
              6-digit code
            </label>
            <input
              id="admin-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              maxLength={8}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="min-h-12 rounded-xl border border-white/15 bg-[#0b1210] px-3 tracking-[0.3em] text-white"
            />
            <button
              type="submit"
              disabled={status === "verifying" || status === "sending"}
              className="min-h-12 rounded-xl bg-[#c8f542] px-4 text-base font-semibold text-[#0b1210] disabled:opacity-60"
            >
              {status === "verifying" ? "Verifying…" : "Verify code"}
            </button>
          </form>
        ) : null}
        {status === "sent" ? (
          <p className="mt-4 text-sm text-[#c8f542]">
            Check your email for a 6-digit code. Enter it above — do not click
            any link.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      </div>
    </main>
  );
}
