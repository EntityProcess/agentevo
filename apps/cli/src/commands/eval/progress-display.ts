import { WriteStream } from "node:tty";

export interface WorkerProgress {
  workerId: number;
  testId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export class ProgressDisplay {
  private readonly workers: Map<number, WorkerProgress> = new Map();
  private readonly stream: NodeJS.WriteStream & { isTTY?: boolean };
  private readonly maxWorkers: number;
  private totalTests = 0;
  private completedTests = 0;
  private renderTimer?: NodeJS.Timeout;
  private lastRenderLines = 0;
  private isInteractive: boolean;

  constructor(maxWorkers: number, stream: NodeJS.WriteStream & { isTTY?: boolean } = process.stderr) {
    this.maxWorkers = maxWorkers;
    this.stream = stream;
    this.isInteractive = !!stream.isTTY && !process.env.CI;
  }

  setTotalTests(count: number): void {
    this.totalTests = count;
  }

  updateWorker(progress: WorkerProgress): void {
    this.workers.set(progress.workerId, progress);
    
    if (progress.status === "completed" || progress.status === "failed") {
      this.completedTests++;
    }

    if (this.isInteractive) {
      this.scheduleRender();
    } else {
      // In non-interactive mode, just print completion events
      if (progress.status === "completed") {
        this.stream.write(`✓ Test ${progress.testId} completed\n`);
      } else if (progress.status === "failed") {
        this.stream.write(`✗ Test ${progress.testId} failed${progress.error ? `: ${progress.error}` : ""}\n`);
      }
    }
  }

  private scheduleRender(): void {
    if (this.renderTimer) {
      return;
    }
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.render();
    }, 100); // Debounce renders to 100ms
  }

  private render(): void {
    if (!this.isInteractive) {
      return;
    }

    // Clear previous render
    if (this.lastRenderLines > 0) {
      this.clearLines(this.lastRenderLines);
    }

    const lines: string[] = [];
    
    // Header with overall progress
    const progressBar = this.buildProgressBar(this.completedTests, this.totalTests);
    lines.push(`\n${progressBar} ${this.completedTests}/${this.totalTests} tests`);

    // Worker status lines
    const sortedWorkers = Array.from(this.workers.values()).sort((a, b) => a.workerId - b.workerId);
    for (const worker of sortedWorkers) {
      const line = this.formatWorkerLine(worker);
      lines.push(line);
    }

    const output = lines.join("\n");
    this.stream.write(output);
    this.lastRenderLines = lines.length;
  }

  private formatWorkerLine(worker: WorkerProgress): string {
    const workerLabel = `Worker ${worker.workerId}`.padEnd(10);
    const statusIcon = this.getStatusIcon(worker.status);
    const elapsed = worker.startedAt ? this.formatElapsed(Date.now() - worker.startedAt) : "";
    const timeLabel = elapsed ? ` (${elapsed})` : "";

    let testLabel = worker.testId;
    if (testLabel.length > 50) {
      testLabel = testLabel.substring(0, 47) + "...";
    }

    return `${workerLabel} ${statusIcon} ${testLabel}${timeLabel}`;
  }

  private getStatusIcon(status: WorkerProgress["status"]): string {
    switch (status) {
      case "pending":
        return "⏳";
      case "running":
        return "🔄";
      case "completed":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "  ";
    }
  }

  private formatElapsed(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  private buildProgressBar(current: number, total: number): string {
    if (total === 0) {
      return "[          ]";
    }

    const width = 20;
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const percentage = Math.floor((current / total) * 100);
    
    return `[${bar}] ${percentage}%`;
  }

  private clearLines(count: number): void {
    if (!this.isInteractive) {
      return;
    }
    
    const tty = this.stream as WriteStream;
    if (!tty.moveCursor || !tty.clearLine) {
      return;
    }
    
    for (let i = 0; i < count; i++) {
      tty.moveCursor(0, -1); // Move up one line
      tty.clearLine(0); // Clear the line
    }
  }

  finish(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }

    if (this.isInteractive) {
      this.render();
      this.stream.write("\n");
    }
  }

  clear(): void {
    if (this.isInteractive && this.lastRenderLines > 0) {
      this.clearLines(this.lastRenderLines);
      this.lastRenderLines = 0;
    }
  }
}
