import { Worker } from "node:worker_threads";
import type { AggregateScans, ScanProgress } from "./aggregate.js";

export type ScanTask = {
  cancel: () => void;
  onProgress: (listener: (progress: ScanProgress) => void) => () => void;
  result: Promise<AggregateScans>;
};

export function scanInWorker(): ScanTask {
  let cancel = () => {};
  const listeners = new Set<(progress: ScanProgress) => void>();
  const result = new Promise<AggregateScans>((resolve, reject) => {
    const worker = new Worker(new URL("./scan-worker.js", import.meta.url));
    cancel = () => { void worker.terminate().catch(() => {}); };
    let complete = false;
    const finish = (callback: () => void) => {
      if (complete) return;
      complete = true;
      callback();
    };
    worker.on("message", (message: { progress?: ScanProgress; scans?: AggregateScans; type?: string }) => {
      if (message.type === "progress" && message.progress) {
        for (const listener of listeners) listener(message.progress);
      } else if (message.type === "result" && message.scans) {
        finish(() => resolve(message.scans!));
      }
    });
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      finish(() => reject(new Error(`Scan worker stopped with code ${code}.`)));
    });
  });
  return { cancel, onProgress: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, result };
}
