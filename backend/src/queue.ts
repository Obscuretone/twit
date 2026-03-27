import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
let channel: amqp.Channel;

export async function connectQueue() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('mentions');
    await channel.assertQueue('feeds');
    await channel.assertQueue('notifications');
    await channel.assertQueue('engagement');
    await channel.assertQueue('hashtags');
    await channel.assertQueue('direct_messages');
    console.log('Connected to RabbitMQ');
  } catch (err) {
    console.error('Failed to connect to RabbitMQ:', err);
  }
}

export async function sendToQueue(queue: string, message: any) {
  if (!channel) {
    console.error('Queue channel not initialized');
    return;
  }
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
}

export async function consumeQueue(queue: string, callback: (msg: any) => void) {
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
