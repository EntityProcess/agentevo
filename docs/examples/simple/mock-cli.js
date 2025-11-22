#!/usr/bin/env node
/**
 * Dummy CLI that echoes a short acknowledgment and attachment name.
 * Usage:
 *   node ./mock-cli.js "{PROMPT}" [--file /path/to/attachment ...]
 * Healthcheck:
 *   node ./mock-cli.js --healthcheck
 */
import path from "node:path";

const args = process.argv.slice(2);

if (args.includes("--healthcheck")) {
  console.log("cli-provider demo: healthy");
  process.exit(0);
}

if (args.length === 0) {
  console.error("No prompt provided.");
  process.exit(1);
}

const [prompt, ...rest] = args;
console.error(`CLI argv: ${JSON.stringify(process.argv.slice(2))}`);
console.error(`CLI rest: ${JSON.stringify(rest)}`);

// Extract attachment paths from --file <path> pairs (or bare paths)
const attachmentNames = [];
for (let i = 0; i < rest.length; i++) {
  const rawArg = rest[i];
  const arg = stripQuotes(rawArg);
  if (arg === "--file" && typeof rest[i + 1] === "string") {
    attachmentNames.push(path.basename(stripQuotes(rest[i + 1])));
    i += 1;
    continue;
  }
  if (arg.startsWith("--file=")) {
    attachmentNames.push(path.basename(stripQuotes(arg.slice("--file=".length))));
    continue;
  }
}

// Fallback: if nothing parsed, attempt to detect known demo files
if (attachmentNames.length === 0) {
  const maybeFiles = [
    path.resolve("./prompts/python.instructions.md"),
    path.resolve("./evals/attachments/example.txt"),
  ];
  for (const file of maybeFiles) {
    attachmentNames.push(path.basename(file));
  }
}

const fileList = attachmentNames.length > 0 ? attachmentNames.join(", ") : "none";
const response =
  fileList === "none"
    ? "No attachments received."
    : `Attachments detected (${attachmentNames.length}): ${fileList}.`;

// Simulate simple echo of prompt to stderr for debugging
console.error(`CLI received prompt: ${prompt}`);

console.log(response);

function stripQuotes(value) {
  if (typeof value !== "string") return value;
  return value.replace(/^['"]+/, "").replace(/['"]+$/, "");
}
