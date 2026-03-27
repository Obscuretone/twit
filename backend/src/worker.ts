import { consumeQueue } from './queue';
import db from './db';

export async function startWorker() {
  console.log('Starting background workers...');

  consumeQueue('mentions', async (data) => {
    const { tweet_id, username, mentioner } = data;
    console.log(`Processing mention: @${username} in tweet ${tweet_id} by @${mentioner}`);
    
    // In a real app, you'd find the user and send a notification.
    // For now we just log it.
    const user = await db('users').where('username', username).first();
    if (user) {
      console.log(`User ${username} found! Send notification logic goes here.`);
    } else {
      console.log(`User ${username} not found.`);
    }
  });
}
