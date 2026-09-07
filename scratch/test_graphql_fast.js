const { buildSchema, graphql } = require('graphql');

const schema = buildSchema(`
  type Shipment {
    id: ID!
    receipt: String!
    container: String!
    chinese: String
    english: String
    commodity: String
    eta: String
    status: String
  }

  type ReceiptSearchResult {
    success: Boolean!
    count: Int!
    receipt: String!
    shipments: [Shipment!]!
  }

  type Query {
    trackByReceipt(receipt: String!): ReceiptSearchResult!
  }
`);

const rootValue = {
  trackByReceipt: ({ receipt }) => ({
    success: true,
    count: 1,
    receipt,
    shipments: [
      {
        id: '999',
        receipt,
        container: 'USI-01',
        chinese: '电子配件 (Electronic Components)',
        english: 'Electronic Accessories & Connectors',
        commodity: 'Electronics',
        eta: '2026-09-14',
        status: 'In Transit',
      },
    ],
  }),
};

async function runTest() {
  const query = `
    query TestFast($receipt: String!) {
      trackByReceipt(receipt: $receipt) {
        success
        count
        receipt
        shipments {
          id
          receipt
          container
          chinese
          english
          commodity
          eta
          status
        }
      }
    }
  `;

  const startTime = Date.now();
  const result = await graphql({
    schema,
    source: query,
    rootValue,
    variableValues: { receipt: 'REC-1002' },
  });
  const duration = Date.now() - startTime;

  console.log(`GraphQL Query Completed in ${duration}ms`);
  console.log('QueryResult:', JSON.stringify(result, null, 2));

  if (result.data?.trackByReceipt?.shipments[0]?.chinese) {
    console.log('PASSED: Chinese commodity (中文品名) field verified successfully!');
  } else {
    console.error('FAILED: Chinese commodity field missing!');
    process.exit(1);
  }
}

runTest();
