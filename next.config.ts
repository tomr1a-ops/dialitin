import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        source: "/mediapipe/wasm/:path*.wasm",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
    ];
  },
};

export default withSerwist(nextConfig);
