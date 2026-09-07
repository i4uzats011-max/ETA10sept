const { buildSchema, graphql } = require('graphql');

const schema = buildSchema(`
  type Shipment {
    id: ID!
    receipt: String!
    container: String!
    containerNumber: String
    shippingLine: String
    eta: String
    status: String
  }

  type ContainerArrival {
    success: Boolean!
    container: String!
    eta: String
    status: String
    formattedArrivalMessage: String!
    daysRemaining: Int
  }

  type ReceiptSearchResult {
    success: Boolean!
    count: Int!
    receipt: String!
    shipments: [Shipment!]!
  }

  type Query {
    trackByReceipt(receipt: String!): ReceiptSearchResult!
    trackByContainer(container: String!): ContainerArrival!
  }
`);

const rootValue = {
  trackByReceipt: ({ receipt }) => ({
    success: true,
    count: 1,
    receipt,
    shipments: [
      {
        id: '123',
        receipt,
        container: 'USI-01',
        containerNumber: null, // Masked
        shippingLine: null,
        eta: '2026-09-12',
        status: 'In Transit',
      },
    ],
  }),
  trackByContainer: ({ container }) => ({
    success: true,
    container,
    eta: '2026-09-12',
    status: 'In Transit',
    formattedArrivalMessage: `${container} is arriving on Friday, 12/09/26 (5 days remaining from today).`,
    daysRemaining: 5,
  }),
};

async function runTest() {
  const query = `
    query TestTrack($receipt: String!, $container: String!) {
      trackByReceipt(receipt: $receipt) {
        success
        count
        receipt
        shipments {
          id
          receipt
          container
          containerNumber
          eta
          status
        }
      }
      trackByContainer(container: $container) {
        success
        container
        formattedArrivalMessage
        daysRemaining
      }
    }
  `;

  const result = await graphql({
    schema,
    source: query,
    rootValue,
    variableValues: { receipt: 'REC-1002', container: 'USI-01' },
  });

  console.log('GraphQL Execution Result:', JSON.stringify(result, null, 2));
  if (result.errors) {
    console.error('GraphQL Errors:', result.errors);
    process.exit(1);
  } else {
    console.log('GraphQL Schema & Query Execution PASSED cleanly!');
  }
}

runTest();
