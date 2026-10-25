const mongoose = require('mongoose');
const { Redis } = require('@upstash/redis');

const mongoUri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

const redis = new Redis({
  url: 'https://concise-fawn-237735.upstash.io',
  token: 'ggAAAAAAA6CnAAIgcDF2HAi-NlZZ6ifVMqSBiMZTmKBAbAkQ7SyxrhBXGb-6aA'
});

async function run() {
  console.log('Connecting to MongoDB...');
  const t0 = Date.now();
  await mongoose.connect(mongoUri, { dbName: 'cargo_tracker_v2' });
  console.log('Connected to MongoDB in', Date.now() - t0, 'ms');

  const Container = mongoose.connection.collection('containers');
  const Shipment = mongoose.connection.collection('shipments');

  const sample = await Container.findOne({});
  const containerName = sample ? sample.container : 'TEST';
  console.log('Testing benchmark with container:', containerName);

  // Measure multi-query database flow
  const dbTimes = [];
  for (let i = 0; i < 5; i++) {
    const s = Date.now();
    const cleanEscaped = containerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalized = new RegExp('^' + cleanEscaped.replace(/[-\s]/g, '[-_\\s]?') + '$', 'i');
    await Container.findOne({
      $or: [{ container: containerName }, { container: { $regex: normalized } }]
    });
    await Shipment.findOne({
      $or: [{ container: containerName }, { container: { $regex: normalized } }]
    });
    dbTimes.push(Date.now() - s);
  }
  const avgDb = (dbTimes.reduce((a, b) => a + b, 0) / dbTimes.length).toFixed(1);
  console.log('MongoDB queries (ms):', dbTimes, 'Average:', avgDb + 'ms');

  // Measure Redis GET latency
  const redisTimes = [];
  for (let i = 0; i < 5; i++) {
    const s = Date.now();
    await redis.get('track:container:' + containerName);
    redisTimes.push(Date.now() - s);
  }
  const avgRedis = (redisTimes.reduce((a, b) => a + b, 0) / redisTimes.length).toFixed(1);
  console.log('Redis REST GET (ms):', redisTimes, 'Average:', avgRedis + 'ms');

  // Measure in-memory cache lookup (L1 cache)
  const memoryCache = new Map();
  memoryCache.set('track:container:' + containerName, { test: 123 });
  const memTimes = [];
  for (let i = 0; i < 5; i++) {
    const s = performance.now();
    memoryCache.get('track:container:' + containerName);
    memTimes.push(Number((performance.now() - s).toFixed(3)));
  }
  const avgMem = (memTimes.reduce((a, b) => a + b, 0) / memTimes.length).toFixed(3);
  console.log('In-memory L1 cache (ms):', memTimes, 'Average:', avgMem + 'ms');

  await mongoose.disconnect();
}

run().catch(console.error);
