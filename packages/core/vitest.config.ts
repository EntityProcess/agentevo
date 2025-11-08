import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../vitest.config";

const packageDir = dirname(fileURLToPath(import.meta.url));
const tsconfigProject = resolve(packageDir, "tsconfig.test.json");

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
    },
  })
);
