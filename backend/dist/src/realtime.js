"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeBroadcaster = void 0;
const events_1 = require("events");
const queue_1 = require("./queue");
const REALTIME_EXCHANGE = 'realtime_events';
class RealtimeBroadcaster {
    clients = [];
    eventEmitter = new events_1.EventEmitter();
    initialized = false;
    constructor() {
        // Initialization happens via init()
    }
    async init() {
        if (this.initialized)
            return;
        await this.setupRabbitMQ();
        this.initialized = true;
    }
    async setupRabbitMQ() {
        try {
            const channel = (0, queue_1.getChannel)();
            if (!channel) {
                console.warn('RabbitMQ channel not available for RealtimeBroadcaster. Make sure connectQueue() is called before init().');
                return;
            }
            await channel.assertExchange(REALTIME_EXCHANGE, 'fanout', { durable: false });
            const q = await channel.assertQueue('', { exclusive: true });
            await channel.bindQueue(q.queue, REALTIME_EXCHANGE, '');
            channel.consume(q.queue, (msg) => {
                if (msg) {
                    const data = JSON.parse(msg.content.toString());
                    this.broadcastToLocalClients(data);
                    channel.ack(msg);
                }
            });
            console.log('RealtimeBroadcaster: RabbitMQ setup complete');
        }
        catch (err) {
            console.error('Failed to setup RabbitMQ for RealtimeBroadcaster:', err);
        }
    }
    addClient(userId, res) {
        const clientId = Math.random().toString(36).substring(7);
        const newClient = { id: clientId, userId, res };
        this.clients.push(newClient);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        // Send initial heartbeat
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
        console.log(`Client ${clientId} connected (User: ${userId}). Total clients: ${this.clients.length}`);
        return clientId;
    }
    removeClient(clientId) {
        this.clients = this.clients.filter(c => c.id !== clientId);
        console.log(`Client ${clientId} disconnected. Total clients: ${this.clients.length}`);
    }
    broadcastToLocalClients(data) {
        const { targetUserId, ...payload } = data;
        this.clients.forEach(client => {
            // If targetUserId is specified, only send to that user
            if (targetUserId && client.userId !== targetUserId) {
                return;
            }
            client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });
    }
    async publishEvent(targetUserId, type, payload) {
        const channel = (0, queue_1.getChannel)();
        if (channel) {
            const message = JSON.stringify({ targetUserId, type, payload });
            channel.publish(REALTIME_EXCHANGE, '', Buffer.from(message));
        }
    }
}
exports.realtimeBroadcaster = new RealtimeBroadcaster();
//# sourceMappingURL=realtime.js.map