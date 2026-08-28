import { parentPort, workerData } from "node:worker_threads";
import { aggregate, type Scope } from "./aggregate.js";

if (!parentPort) throw new Error("Scan worker needs a parent port.");
parentPort.postMessage(aggregate(workerData as Scope));
