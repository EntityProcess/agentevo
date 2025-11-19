import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  sourcemap: true,
  clean: true,
  dts: false,
  target: "node20",
  platform: "node",
  tsconfig: "./tsconfig.build.json",
  // Bundle @agentv/core but keep micromatch external (it has dynamic requires)
  noExternal: [/^@agentv\//],
  external: ["micromatch"],
  // Copy template files after build
  onSuccess: async () => {
    const templatesDir = path.join("dist", "templates");
    if (!existsSync(templatesDir)) {
      mkdirSync(templatesDir, { recursive: true });
    }
    
    // Copy template files
    const templates = [
      "eval-build.prompt.md",
      "eval-schema.json",
      "config-schema.json"
    ];
    
    for (const file of templates) {
      copyFileSync(
        path.join("src", "templates", file),
        path.join(templatesDir, file)
      );
    }
    
    console.log("✓ Template files copied to dist/templates");
  },
});
