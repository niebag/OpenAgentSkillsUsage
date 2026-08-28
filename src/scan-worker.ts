import { parentPort, workerData } from "node:worker_threads";
import { aggregate, type Scope } from "./aggregate.js";

const port = parentPort;
if (!port) throw new Error("Scan worker needs a parent port.");
port.postMessage({ type: "result", scan: aggregate(workerData as Scope, (progress) => {
  port.postMessage({ type: "progress", progress });
}) });
