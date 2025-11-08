import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../vitest.config.js";

const appDir = dirname(fileURLToPath(import.meta.url));
const tsconfigProject = resolve(appDir, "tsconfig.test.json");
const coreSourceDir = resolve(appDir, "../../packages/core/src");

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
    ],
    resolve: {
      alias: [
        {
          find: "@agentevo/core",
          replacement: resolve(coreSourceDir, "index.ts"),
        },
        {
          find: "@agentevo/core/",
          replacement: `${coreSourceDir}/`,
        },
      ],
    },
    test: {
      include: ["test/**/*.test.ts"],
    },
  })
);
