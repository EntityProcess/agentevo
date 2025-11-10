import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { stringify as stringifyYaml } from "yaml";

export class YamlWriter {
  private readonly stream: ReturnType<typeof createWriteStream>;
  private closed = false;
  private isFirst = true;

  private constructor(stream: ReturnType<typeof createWriteStream>) {
    this.stream = stream;
  }

  static async open(filePath: string): Promise<YamlWriter> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, { flags: "w", encoding: "utf8" });
    return new YamlWriter(stream);
  }

  async append(record: unknown): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot write to closed YAML writer");
    }

    // Convert to YAML with proper multi-line string handling
    const yamlDoc = stringifyYaml(record, {
      indent: 2,
      lineWidth: 0, // Disable line wrapping
      defaultStringType: "PLAIN",
      defaultKeyType: "PLAIN",
    });

    // Add YAML document separator (---) between records
    const separator = this.isFirst ? "---\n" : "\n---\n";
    this.isFirst = false;

    const content = `${separator}${yamlDoc}`;

    if (!this.stream.write(content)) {
      await new Promise<void>((resolve, reject) => {
        this.stream.once("drain", resolve);
        this.stream.once("error", reject);
      });
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stream.end();
    await finished(this.stream);
  }
}
