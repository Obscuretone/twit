"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const queue_1 = require("./queue");
const worker_1 = require("./worker");
const storage_1 = require("./storage");
const PORT = process.env.PORT || 4000;
const delay = (ms) => new Promise(res => setTimeout(res, ms));
async function start() {
    let rabbitmqConnected = false;
    for (let i = 0; i < 5; i++) {
        try {
            await (0, queue_1.connectQueue)();
            rabbitmqConnected = true;
            break;
        }
        catch (err) {
            console.log('Waiting for RabbitMQ to start...');
            await delay(3000);
        }
    }
    if (!rabbitmqConnected) {
        console.error('Failed to connect to RabbitMQ after multiple attempts.');
    }
    await (0, storage_1.initS3)();
    await (0, worker_1.startWorker)();
    app_1.default.listen(PORT, () => {
        console.log(`Backend listening on port ${PORT}`);
    });
}
start();
//# sourceMappingURL=index.js.map