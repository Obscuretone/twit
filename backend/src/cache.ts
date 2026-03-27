import { Client } from 'memjs';

const MEMCACHED_HOST = process.env.MEMCACHED_HOST || 'localhost:11211';
const cache = Client.create(MEMCACHED_HOST);

export default cache;
