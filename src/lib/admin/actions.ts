"use server";

import { redirect } from "next/navigation";
import { isAllowedAdminEmail, requireAdmin } from "@/lib/admin/auth";
import { isContentKind, type ContentKind } from "@/lib/admin/constants";
import { validateFeelCue } from "@/lib/admin/feel-cue";
import { getMagicLinkRedirectTo } from "@/lib/admin/site-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; id: string } | { ok: false; error: string };

export async function requestAdminMagicLink(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, error: "Enter an admin email." };
  }

  const allowed = await isAllowedAdminEmail(trimmed);
  if (!allowed) {
    return {
      ok: false,
      error:
        "This email is not on the admin list.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: getMagicLinkRedirectTo(),
      shouldCreateUser: true,
    },
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
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
