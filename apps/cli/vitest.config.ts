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
          find: /^@agentv\/core$/,
          replacement: resolve(coreSourceDir, "index.ts"),
        },
        {
          find: /^@agentv\/core\/(.*)$/,
          replacement: resolve(coreSourceDir, "$1"),
        },
      ],
    },
    test: {
      include: ["test/**/*.test.ts"],
      server: {
        deps: {
          inline: ["dotenv", "execa"],
        },
      },
    },
  }),
);
