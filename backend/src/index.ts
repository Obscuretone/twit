import app from './app';
import { connectQueue } from './queue';
import { startWorker } from './worker';
import { initS3 } from './storage';
import { realtimeBroadcaster } from './realtime';

const PORT = process.env.PORT || 4000;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function start() {
  let rabbitmqConnected = false;
  for (let i = 0; i < 5; i++) {
    try {
      await connectQueue();
      rabbitmqConnected = true;
      break;
    } catch (err) {
      console.log('Waiting for RabbitMQ to start...');
      await delay(3000);
    }
  }

  if (!rabbitmqConnected) {
    console.error('Failed to connect to RabbitMQ after multiple attempts.');
  } else {
    // Initialize realtime broadcaster now that RabbitMQ is ready
    await realtimeBroadcaster.init();
  }

  await initS3();
  await startWorker();
  
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start();
