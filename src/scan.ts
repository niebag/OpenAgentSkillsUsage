import { Worker } from "node:worker_threads";
import type { AggregateScan, ScanProgress, Scope } from "./aggregate.js";

export type ScanTask = {
  cancel: () => void;
  onProgress: (listener: (progress: ScanProgress) => void) => () => void;
  result: Promise<AggregateScan>;
};

export function scanInWorker(scope: Scope): ScanTask {
  let cancel = () => {};
  const listeners = new Set<(progress: ScanProgress) => void>();
  const result = new Promise<AggregateScan>((resolve, reject) => {
    const worker = new Worker(new URL("./scan-worker.js", import.meta.url), { workerData: scope });
    cancel = () => { void worker.terminate().catch(() => {}); };
    let complete = false;
    const finish = (callback: () => void) => {
      if (complete) return;
      complete = true;
      callback();
    };
    worker.on("message", (message: { progress?: ScanProgress; scan?: AggregateScan; type?: string }) => {
      if (message.type === "progress" && message.progress) {
        for (const listener of listeners) listener(message.progress);
      } else if (message.type === "result" && message.scan) {
        finish(() => resolve(message.scan!));
      }
    });
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      finish(() => reject(new Error(`Scan worker stopped with code ${code}.`)));
    });
  });
  return { cancel, onProgress: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, result };
}
