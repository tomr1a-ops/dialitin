import { BandsSeedWorkspace } from "@/components/admin/bands-seed-workspace";
import { loadBandsSeedPreview } from "@/lib/admin/bands-seed";

export default async function BandsSeedPage() {
  const preview = await loadBandsSeedPreview();
  return <BandsSeedWorkspace initialPreview={preview} />;
}
