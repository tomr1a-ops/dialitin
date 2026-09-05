import { notFound } from "next/navigation";
import { ContentEditor } from "@/components/admin/content-editor";
import { kindFromSlug } from "@/lib/admin/constants";
import { listKindRows, listPublishedMetrics } from "@/lib/admin/queries";

export default async function AdminContentKindPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: slug } = await params;
  if (slug === "snapshots") {
    notFound();
  }
  const kind = kindFromSlug(slug);
  if (!kind) {
    notFound();
  }
  const [rows, metrics] = await Promise.all([
    listKindRows(kind),
    listPublishedMetrics(),
  ]);
  return (
    <ContentEditor kind={kind} initialRows={rows} publishedMetrics={metrics} />
  );
}
