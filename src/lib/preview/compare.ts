import type { Diagnosis } from "@/lib/preview/diagnose";

export type HeadlineCompare = {
  draftHeadline: string | null;
  publishedHeadline: string | null;
  headlineChanged: boolean;
};

export function compareDiagnoses(
  draft: Diagnosis,
  published: Diagnosis,
): HeadlineCompare {
  const draftHeadline = draft?.headline ?? null;
  const publishedHeadline = published?.headline ?? null;
  return {
    draftHeadline,
    publishedHeadline,
    headlineChanged: draftHeadline !== publishedHeadline,
  };
}

export function swingsThatChangeHeadline(
  rows: Array<{ swingId: string; compare: HeadlineCompare }>,
) {
  return rows
    .filter((row) => row.compare.headlineChanged)
    .map((row) => row.swingId);
}
