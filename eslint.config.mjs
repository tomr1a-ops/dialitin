import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "public/swe-worker*",
    "public/mediapipe/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/app/admin/**",
      "src/lib/reveal/placeholder.ts",
      "src/lib/reveal/trace-path.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/reveal/placeholder",
              message:
                "Placeholder RevealInput is admin/demo only. Use fetchRevealDiagnosis + diagnosisToRevealInput.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/reveal/**/*.{ts,tsx}", "src/app/reveal/**", "src/app/fix/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/engine/slo-mo-export",
              message:
                "Use formatEngineReasonForDisplay from @/lib/reveal/reason-display.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
