import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface Template {
  path: string;
  content: string;
}

export class TemplateManager {
  static getTemplates(): Template[] {
    // Resolve templates directory:
    // - In production (dist): templates are at dist/templates/
    // - In development (src): templates are at src/templates/
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    
    // Check if we're running from dist or src
    let templatesDir: string;
    if (currentDir.includes(path.sep + "dist")) {
      // Production: templates are at dist/templates/
      templatesDir = path.join(currentDir, "templates");
    } else {
      // Development: templates are at src/templates/ (same directory as this file)
      templatesDir = currentDir;
    }
    
    const evalBuildPrompt = readFileSync(
      path.join(templatesDir, "eval-build.prompt.md"),
      "utf-8"
    );
    const evalSchema = readFileSync(
      path.join(templatesDir, "eval-schema.json"),
      "utf-8"
    );

    return [
      {
        path: "prompts/eval-build.prompt.md",
        content: evalBuildPrompt,
      },
      {
        path: "contexts/eval-schema.json",
        content: evalSchema,
      },
    ];
  }
}
