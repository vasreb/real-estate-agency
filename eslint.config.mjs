import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import fsd from "eslint-plugin-fsd-lint";
import boundaries from "eslint-plugin-boundaries";
import architecture from "./tooling/eslint-architecture-plugin.mjs";

const fsdOptions = {
  rootPath: "/apps/web/src/",
  tsconfigPath: "./apps/web/tsconfig.json",
  alias: { value: "@", withSlash: true },
  // FSD official Next.js guide uses _app and _pages to avoid route directory collision.
  folderPattern: { enabled: true, regex: "^(_)?(.*)", extractionGroup: 2 },
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.d.ts",
      "**/.stryker-tmp/**",
      "**/generated/**",
      ".omo/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: globals.node } },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...nextVitals.map((c) => ({
    ...c,
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  })),
  ...nextTypescript.map((c) => ({
    ...c,
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  })),
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    settings: { next: { rootDir: "apps/web/" } },
  },
  {
    files: ["apps/api/src/modules/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "domain", pattern: "apps/api/src/modules/*/domain/*" },
        {
          type: "infrastructure",
          pattern: "apps/api/src/modules/*/infrastructure/*",
        },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: "domain" },
              disallow: { to: { type: "infrastructure" } },
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/api/src/**/*.{ts,tsx}",
      "apps/web/src/**/*.{ts,tsx}",
      "apps/web/app/**/*.{ts,tsx}",
    ],
    plugins: { architecture },
    rules: { "architecture/ownership": "error" },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { fsd },
    rules: {
      "fsd/forbidden-imports": ["error", fsdOptions],
      "fsd/no-cross-slice-dependency": ["error", fsdOptions],
      "fsd/no-public-api-sidestep": [
        "error",
        {
          ...fsdOptions,
          publicApi: { allowSegmentImports: false, enforceShared: false },
        },
      ],
      "fsd/no-relative-imports": [
        "error",
        { ...fsdOptions, allowSameSlice: true },
      ],
      "fsd/no-ui-in-business-logic": ["error", fsdOptions],
    },
  },
  {
    files: [
      "**/*.{spec,test}.{ts,tsx}",
      "**/*.e2e-spec.ts",
      "**/test/**/*.{ts,tsx}",
    ],
    rules: { "@typescript-eslint/unbound-method": "off" },
  },
  prettier,
);
