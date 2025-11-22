import path from "node:path";

import { isGuidelineFile } from "../yaml-parser.js";
import type { ProviderRequest } from "./types.js";

export interface PromptDocumentOptions {
  readonly guidelinePatterns?: readonly string[];
  readonly guidelineOverrides?: ReadonlySet<string>;
}

export function buildPromptDocument(
  request: ProviderRequest,
  inputFiles: readonly string[] | undefined,
  options?: PromptDocumentOptions,
): string {
  const parts: string[] = [];

  const guidelineFiles = collectGuidelineFiles(
    inputFiles,
    options?.guidelinePatterns ?? request.guideline_patterns,
    options?.guidelineOverrides,
  );
  const inputFilesList = collectInputFiles(inputFiles);

  const nonGuidelineInputFiles = inputFilesList.filter(
    (file) => !guidelineFiles.includes(file),
  );

  const prereadBlock = buildMandatoryPrereadBlock(guidelineFiles, nonGuidelineInputFiles);
  if (prereadBlock.length > 0) {
    parts.push("\n", prereadBlock);
  }

  parts.push("\n[[ ## user_query ## ]]\n", request.prompt.trim());

  return parts.join("\n").trim();
}

export function normalizeInputFiles(inputFiles: readonly string[] | undefined): string[] | undefined {
  if (!inputFiles || inputFiles.length === 0) {
    return undefined;
  }
  const deduped = new Map<string, string>();
  for (const inputFile of inputFiles) {
    const absolutePath = path.resolve(inputFile);
    if (!deduped.has(absolutePath)) {
      deduped.set(absolutePath, absolutePath);
    }
  }
  return Array.from(deduped.values());
}

export function collectGuidelineFiles(
  inputFiles: readonly string[] | undefined,
  guidelinePatterns: readonly string[] | undefined,
  overrides?: ReadonlySet<string>,
): string[] {
  if (!inputFiles || inputFiles.length === 0) {
    return [];
  }

  const unique = new Map<string, string>();
  for (const inputFile of inputFiles) {
    const absolutePath = path.resolve(inputFile);
    if (overrides?.has(absolutePath)) {
      if (!unique.has(absolutePath)) {
        unique.set(absolutePath, absolutePath);
      }
      continue;
    }

    const normalized = absolutePath.split(path.sep).join("/");
    if (isGuidelineFile(normalized, guidelinePatterns)) {
      if (!unique.has(absolutePath)) {
        unique.set(absolutePath, absolutePath);
      }
    }
  }

  return Array.from(unique.values());
}

function collectInputFiles(inputFiles: readonly string[] | undefined): string[] {
  if (!inputFiles || inputFiles.length === 0) {
    return [];
  }
  const unique = new Map<string, string>();
  for (const inputFile of inputFiles) {
    const absolutePath = path.resolve(inputFile);
    if (!unique.has(absolutePath)) {
      unique.set(absolutePath, absolutePath);
    }
  }
  return Array.from(unique.values());
}

function buildMandatoryPrereadBlock(
  guidelineFiles: readonly string[],
  inputFiles: readonly string[],
): string {
  if (guidelineFiles.length === 0 && inputFiles.length === 0) {
    return "";
  }

  const buildList = (files: readonly string[]): string[] =>
    files.map((absolutePath) => {
      const fileName = path.basename(absolutePath);
      const fileUri = pathToFileUri(absolutePath);
      return `* [${fileName}](${fileUri})`;
    });

  const sections: string[] = [];
  if (guidelineFiles.length > 0) {
    sections.push(`Read all guideline files:\n${buildList(guidelineFiles).join("\n")}.`);
  }

  if (inputFiles.length > 0) {
    sections.push(`Read all input files:\n${buildList(inputFiles).join("\n")}.`);
  }

  sections.push(
    "If any file is missing, fail with ERROR: missing-file <filename> and stop.",
    "Then apply system_instructions on the user query below.",
  );

  return sections.join("\n");
}

function pathToFileUri(filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:///${normalizedPath}`;
  }
  return `file://${normalizedPath}`;
}
