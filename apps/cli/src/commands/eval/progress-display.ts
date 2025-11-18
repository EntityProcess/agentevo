import logUpdate from "log-update";

export interface WorkerProgress {
  workerId: number;
  evalId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export class ProgressDisplay {
  private readonly workers: Map<number, WorkerProgress> = new Map();
  private readonly maxWorkers: number;
  private totalTests = 0;
  private completedTests = 0;
  private renderTimer?: NodeJS.Timeout;
  private isInteractive: boolean;

  constructor(maxWorkers: number) {
    this.maxWorkers = maxWorkers;
    this.isInteractive = process.stderr.isTTY && !process.env.CI;
  }

  start(): void {
    if (this.isInteractive) {
      // Print initial empty line for visual separation
      console.log("");
    }
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
        console.log(`✓ Test ${progress.evalId} completed`);
      } else if (progress.status === "failed") {
        console.log(`✗ Test ${progress.evalId} failed${progress.error ? `: ${progress.error}` : ""}`);
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

    const lines: string[] = [];
    
    // Empty line above progress display
    //lines.push("");
    
    // Header with overall progress
    const progressBar = this.buildProgressBar(this.completedTests, this.totalTests);
    lines.push(`${progressBar} ${this.completedTests}/${this.totalTests} tests`);
    
    // Empty line between progress and workers
    lines.push("");

    // Worker status lines
    const sortedWorkers = Array.from(this.workers.values()).sort((a, b) => a.workerId - b.workerId);
    for (const worker of sortedWorkers) {
      const line = this.formatWorkerLine(worker);
      lines.push(line);
    }

    // Use log-update to handle all cursor positioning
    logUpdate(lines.join("\n"));
  }

  private formatWorkerLine(worker: WorkerProgress): string {
    const workerLabel = `Worker ${worker.workerId}`.padEnd(10);
    const statusIcon = this.getStatusIcon(worker.status);
    const elapsed = worker.startedAt ? this.formatElapsed(Date.now() - worker.startedAt) : "";
    const timeLabel = elapsed ? ` (${elapsed})` : "";

    let testLabel = worker.evalId;
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

  finish(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }

    if (this.isInteractive) {
      this.render();
      logUpdate.done(); // Persist the final output
    }
  }

  clear(): void {
    if (this.isInteractive) {
      logUpdate.clear();
    }
  }
}