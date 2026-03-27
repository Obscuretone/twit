"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectQueue = connectQueue;
exports.getChannel = getChannel;
exports.sendToQueue = sendToQueue;
exports.consumeQueue = consumeQueue;
const amqplib_1 = __importDefault(require("amqplib"));
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
let channel;
async function connectQueue() {
    const connection = await amqplib_1.default.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('mentions');
    await channel.assertQueue('feeds');
    await channel.assertQueue('notifications');
    await channel.assertQueue('engagement');
    await channel.assertQueue('hashtags');
    await channel.assertQueue('direct_messages');
    await channel.assertQueue('analytics');
    console.log('Connected to RabbitMQ');
}
function getChannel() {
    return channel;
}
async function sendToQueue(queue, message) {
    if (!channel) {
        console.error('Queue channel not initialized');
        return;
    }
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
}
async function consumeQueue(queue, callback) {
    if (!channel) {
        console.error('Queue channel not initialized');
        return;
    }
    channel.consume(queue, (msg) => {
        if (msg) {
            callback(JSON.parse(msg.content.toString()));
            channel.ack(msg);
        }
    });
}
//# sourceMappingURL=queue.js.map