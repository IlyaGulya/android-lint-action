import path from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vitest from "@vitest/eslint-plugin";
import nodePlugin from "eslint-plugin-n";
import simpleImportSort from "eslint-plugin-simple-import-sort";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ["**/dist/", "**/node_modules/", "**/coverage/"],
  },
  {
    plugins: {
      n: nodePlugin,
    },
    rules: {
      "n/exports-style": ["error", "module.exports"],
    },
  },
  ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
    "plugin:prettier/recommended",
  ),
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "simple-import-sort": simpleImportSort,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",

      parserOptions: {
        project: "tsconfig.json",
      },
    },

    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "no-console": "warn",
      "no-process-exit": "off",

      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],

    rules: {
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    files: ["**/*.ts"],

    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            [
              "^(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|tty|url|util|vm|zlib|freelist|v8|process|async_hooks|http2|perf_hooks)(/.*|$)",
            ],
            [
              String.raw`^node:.*\u0000$`,
              String.raw`^@?\w.*\u0000$`,
              String.raw`^[^.].*\u0000$`,
              String.raw`^\..*\u0000$`,
            ],
            [String.raw`^\u0000`],
            ["^node:"],
            [String.raw`^@?\w`],
            ["^@/tests(/.*|$)"],
            ["^@/src(/.*|$)"],
            ["^"],
            [String.raw`^\.`],
          ],
        },
      ],
    },
  },
  ...compat
    .extends("plugin:@typescript-eslint/disable-type-checked")
    .map(config => ({
      ...config,
      files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    })),
  {
    files: ["tests/**"],

    plugins: {
      vitest,
    },

    rules: {
      ...vitest.configs.recommended.rules,
      "@typescript-eslint/unbound-method": "off",
      "vitest/expect-expect": "off",
      "vitest/no-standalone-expect": "off",
    },
  },
];
