import { Worker } from "node:worker_threads";
import type { AggregateScan, Scope } from "./aggregate.js";

export type ScanTask = { cancel: () => void; result: Promise<AggregateScan> };

export function scanInWorker(scope: Scope): ScanTask {
  let cancel = () => {};
  const result = new Promise<AggregateScan>((resolve, reject) => {
    const worker = new Worker(new URL("./scan-worker.js", import.meta.url), { workerData: scope });
    cancel = () => { void worker.terminate().catch(() => {}); };
    let complete = false;
    const finish = (callback: () => void) => {
      if (complete) return;
      complete = true;
      callback();
    };
    worker.once("message", (scan: AggregateScan) => finish(() => resolve(scan)));
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      finish(() => reject(new Error(`Scan worker stopped with code ${code}.`)));
    });
  });
  return { cancel, result };
}
