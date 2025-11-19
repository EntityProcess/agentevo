import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TemplateManager } from "../../templates/index.js";

export interface InitCommandOptions {
  targetPath?: string;
}

export async function initCommand(options: InitCommandOptions = {}): Promise<void> {
  const targetPath = path.resolve(options.targetPath ?? ".");
  const githubDir = path.join(targetPath, ".github");

  // Create .github directory if it doesn't exist
  if (!existsSync(githubDir)) {
    mkdirSync(githubDir, { recursive: true });
  }

  // Get templates
  const templates = TemplateManager.getTemplates();

  // Copy each template to .github
  for (const template of templates) {
    const targetFilePath = path.join(githubDir, template.path);
    const targetDirPath = path.dirname(targetFilePath);

    // Create directory if needed
    if (!existsSync(targetDirPath)) {
      mkdirSync(targetDirPath, { recursive: true });
    }

    // Write file
    writeFileSync(targetFilePath, template.content, "utf-8");
    console.log(`Created ${path.relative(targetPath, targetFilePath)}`);
  }

  console.log("\nAgentV initialized successfully!");
  console.log(`\nFiles installed to ${path.relative(targetPath, githubDir)}:`);
  templates.forEach((t) => console.log(`  - ${t.path}`));
  console.log("\nYou can now create eval files using the schema and prompt templates.");
}
