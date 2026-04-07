import { EventEmitter } from 'events';
import { Response } from 'express';
import { getChannel } from './queue';

import amqp from 'amqplib';

const REALTIME_EXCHANGE = 'realtime_events';

interface Client {
  id: string;
  userId: string;
  res: Response;
}

class RealtimeBroadcaster {
  private clients: Client[] = [];
  private eventEmitter = new EventEmitter();
  private initialized = false;

  constructor() {
    // Initialization happens via init()
  }

  public async init() {
    if (this.initialized) return;
    await this.setupRabbitMQ();
    this.initialized = true;
  }

  private async setupRabbitMQ() {
    try {
      const channel = getChannel();
      if (!channel) {
        console.warn('RabbitMQ channel not available for RealtimeBroadcaster. Make sure connectQueue() is called before init().');
        return;
      }

      await channel.assertExchange(REALTIME_EXCHANGE, 'fanout', { durable: false });
      const q = await channel.assertQueue('', { exclusive: true });
      await channel.bindQueue(q.queue, REALTIME_EXCHANGE, '');

      channel.consume(q.queue, (msg: amqp.ConsumeMessage | null) => {
        if (msg) {
          const data = JSON.parse(msg.content.toString());
          this.broadcastToLocalClients(data);
          channel.ack(msg);
        }
      });
      console.log('RealtimeBroadcaster: RabbitMQ setup complete');
    } catch (err) {
      console.error('Failed to setup RabbitMQ for RealtimeBroadcaster:', err);
    }
  }

  public addClient(userId: string, res: Response) {
    const clientId = Math.random().toString(36).substring(7);
    const newClient: Client = { id: clientId, userId, res };
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

  public removeClient(clientId: string) {
    this.clients = this.clients.filter(c => c.id !== clientId);
    console.log(`Client ${clientId} disconnected. Total clients: ${this.clients.length}`);
  }

  private broadcastToLocalClients(data: any) {
    const { targetUserId, ...payload } = data;
    
    this.clients.forEach(client => {
      // If targetUserId is specified, only send to that user
      if (targetUserId && client.userId !== targetUserId) {
        return;
      }
      
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
  }

  public async publishEvent(targetUserId: string | null, type: string, payload: any) {
    const channel = getChannel();
    if (channel) {
      const message = JSON.stringify({ targetUserId, type, payload });
      channel.publish(REALTIME_EXCHANGE, '', Buffer.from(message));
    }
  }
}

export const realtimeBroadcaster = new RealtimeBroadcaster();
