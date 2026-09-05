import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { AdminLoginForm } from "@/components/admin/login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getAdminSession();
  if (session) {
    const params = await searchParams;
    const next =
      typeof params.next === "string" && params.next.startsWith("/admin")
        ? params.next
        : "/admin/content";
    redirect(next);
  }
  return <AdminLoginForm />;
}
