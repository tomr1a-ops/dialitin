import { redirect } from "next/navigation";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminSession = {
  userId: string;
  email: string;
};

export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email) {
    return null;
  }

  const secret = createSecretSupabaseClient();
  const { data, error } = await secret
    .from("admin_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { userId: user.id, email };
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect("/admin/unauthorized");
    }
    redirect("/admin/login");
  }
  return session;
}

export async function isAllowedAdminEmail(email: string): Promise<boolean> {
  const secret = createSecretSupabaseClient();
  const { data } = await secret
    .from("admin_users")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return Boolean(data);
}
