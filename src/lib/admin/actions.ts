"use server";

import { redirect } from "next/navigation";
import { isAllowedAdminEmail, requireAdmin } from "@/lib/admin/auth";
import { isContentKind, type ContentKind } from "@/lib/admin/constants";
import { validateFeelCue } from "@/lib/admin/feel-cue";
import {
  buildAdminOtpSendParams,
  buildAdminOtpVerifyParams,
} from "@/lib/admin/otp";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; id: string } | { ok: false; error: string };

export async function requestAdminEmailOtp(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const params = buildAdminOtpSendParams(email);
  if (!params.email || !params.email.includes("@")) {
    return { ok: false, error: "Enter an admin email." };
  }

  const allowed = await isAllowedAdminEmail(params.email);
  if (!allowed) {
    return {
      ok: false,
      error: "This email is not on the admin list.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp(params);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function verifyAdminEmailOtp(
  email: string,
  token: string,
): Promise<{ ok: false; error: string }> {
  const params = buildAdminOtpVerifyParams(email, token);
  if (!params.email || !params.email.includes("@")) {
    return { ok: false, error: "Enter an admin email." };
  }
  if (!/^\d{6,8}$/.test(params.token)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const allowed = await isAllowedAdminEmail(params.email);
  if (!allowed) {
    return {
      ok: false,
      error: "This email is not on the admin list.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp(params);
  if (error) {
    return { ok: false, error: error.message };
  }
  redirect("/admin/content");
}

export async function signOutAdmin() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function saveCoachingVersion(
  kind: string,
  objectId: string,
  status: "draft" | "published",
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  await requireAdmin();
  if (!isContentKind(kind)) {
    return { ok: false, error: "Unknown content table." };
  }
  if (!objectId) {
    return { ok: false, error: "Missing object id." };
  }

  const checked = validatePayload(kind, payload);
  if (!checked.ok) {
    return checked;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_save_coaching", {
    p_kind: kind,
    p_object_id: objectId,
    p_status: status,
    p_payload: checked.payload,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: String(data) };
}

function validatePayload(
  kind: ContentKind,
  payload: Record<string, unknown>,
):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  if (kind === "voice") {
    const feelCue = String(payload.feel_cue ?? "");
    const cue = validateFeelCue(feelCue);
    if (!cue.ok) {
      return { ok: false, error: `${cue.reason} ${cue.rule}` };
    }
  }
  if (kind === "fault_families") {
    const members = payload.members;
    if (typeof members === "string") {
      payload = {
        ...payload,
        members: members
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }
  }
  if (kind === "faults" && typeof payload.metric_rules === "string") {
    try {
      payload = {
        ...payload,
        metric_rules: JSON.parse(payload.metric_rules || "{}"),
      };
    } catch {
      return { ok: false, error: "metric_rules must be valid JSON." };
    }
  }
  if (kind === "setup_priority" && typeof payload.tier_weights === "string") {
    try {
      payload = {
        ...payload,
        tier_weights: JSON.parse(payload.tier_weights || "{}"),
      };
    } catch {
      return { ok: false, error: "tier_weights must be valid JSON." };
    }
  }
  return { ok: true, payload };
}
