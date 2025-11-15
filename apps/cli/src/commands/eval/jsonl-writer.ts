import { Mutex } from "async-mutex";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";

export class JsonlWriter {
  private readonly stream: ReturnType<typeof createWriteStream>;
  private readonly mutex = new Mutex();
  private closed = false;

  private constructor(stream: ReturnType<typeof createWriteStream>) {
    this.stream = stream;
  }

  static async open(filePath: string): Promise<JsonlWriter> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, { flags: "w", encoding: "utf8" });
    return new JsonlWriter(stream);
  }

  async append(record: unknown): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.closed) {
        throw new Error("Cannot write to closed JSONL writer");
      }
      const line = `${JSON.stringify(record)}\n`;
      if (!this.stream.write(line)) {
        await new Promise<void>((resolve, reject) => {
          this.stream.once("drain", resolve);
          this.stream.once("error", reject);
        });
      }
    });
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
