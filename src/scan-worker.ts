import { parentPort } from "node:worker_threads";
import { aggregateScopes } from "./aggregate.js";

const port = parentPort;
if (!port) throw new Error("Scan worker needs a parent port.");
port.postMessage({ type: "result", scans: aggregateScopes((progress) => {
  port.postMessage({ type: "progress", progress });
}) });
