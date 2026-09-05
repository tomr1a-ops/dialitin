import { createSerwistRoute } from "@serwist/turbopack";
import { SERWIST_POSE_PRECACHE } from "@/lib/pose/assets";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    additionalPrecacheEntries: [...SERWIST_POSE_PRECACHE],
  });
