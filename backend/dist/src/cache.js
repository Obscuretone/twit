"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memjs_1 = require("memjs");
const MEMCACHED_HOST = process.env.MEMCACHED_HOST || 'localhost:11211';
const cache = memjs_1.Client.create(MEMCACHED_HOST);
exports.default = cache;
//# sourceMappingURL=cache.js.map