export class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  
  constructor(private readonly concurrency: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Global semaphore for all Sharp operations in the monolithic process
// Ensures that up to 3 image processing operations can occur concurrently.
// This balances throughput (API uploads) with memory protection (<512MB RAM).
export const sharpLock = new Semaphore(3);
