import fs from 'fs';
import path from 'path';

// Load .env.local
const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
for (const line of envContent.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const idx = t.indexOf('=');
  if (idx !== -1) {
    process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
}

import { GET as trackContainerGET } from '../app/api/track/container/route';
import { POST as graphqlPOST } from '../app/api/graphql/route';
import { NextRequest } from 'next/server';
import { getRedisClient, calculateEtaPlus2DaysTTL } from '../lib/redis';

async function test() {
  console.log('Testing trackContainerGET for USSI-300...');
  const req1 = new NextRequest('http://localhost:3000/api/track/container?container=USSI-300');
  const res1 = await trackContainerGET(req1);
  const data1 = await res1.json();
  console.log('trackContainerGET result:', data1);

  const redis = getRedisClient();
  const cached1 = await redis?.get('public:track:container:ussi300');
  console.log('\nRedis after trackContainerGET:', cached1);

  console.log('\nTesting graphqlPOST for USSI-300...');
  const gqlBody = {
    query: `
      query TrackContainer($container: String!) {
        trackByContainer(container: $container) {
          success
          container
          portDate
          eta
          dateOfDelivery
          deliveryDate
          isDelivered
          daysToDeliver
          status
        }
      }
    `,
    variables: { container: 'USSI-300' }
  };
  const req2 = new NextRequest('http://localhost:3000/api/graphql', {
    method: 'POST',
    body: JSON.stringify(gqlBody),
    headers: { 'Content-Type': 'application/json' }
  });
  const res2 = await graphqlPOST(req2);
  const data2 = await res2.json();
  console.log('graphqlPOST result:', data2);

  const cached2 = await redis?.get('public:track:container:ussi300');
  console.log('\nRedis after graphqlPOST:', cached2);
}

test().catch(console.error);
