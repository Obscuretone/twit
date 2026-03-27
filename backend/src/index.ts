import app from './app';
import { connectQueue } from './queue';
import { startWorker } from './worker';
import { initS3 } from './storage';

const PORT = process.env.PORT || 4000;

async function start() {
  await connectQueue();
  await initS3();
  await startWorker();
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start();
