import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  sourcemap: true,
  clean: true,
  dts: false,
  target: "node20",
  tsconfig: "./tsconfig.build.json",
  // Bundle @agentevo/core since it's a workspace dependency
  noExternal: ["@agentevo/core"],
  // Copy template files after build
  onSuccess: async () => {
    const templatesDir = path.join("dist", "templates");
    if (!existsSync(templatesDir)) {
      mkdirSync(templatesDir, { recursive: true });
    }
    
    // Copy template files
    const templates = [
      "eval-build.prompt.md",
      "eval-schema.json"
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
