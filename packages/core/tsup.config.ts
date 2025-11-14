import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  sourcemap: true,
  clean: true,
  dts: {
    resolve: true,
    compilerOptions: {
      composite: false,
    },
  },
  target: "node20",
  tsconfig: "./tsconfig.build.json",
});
