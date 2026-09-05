import { redirect } from "next/navigation";

export default function DebugRedirectPage() {
  redirect("/reveal");
}
