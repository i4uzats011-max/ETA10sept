const { GET } = require('../app/api/sales/exception-report/route');
const { NextRequest } = require('next/server');

// Since NextRequest in Node requires URL:
async function test() {
  const req = new NextRequest('http://localhost:3000/api/sales/exception-report?container=ALL', {
    headers: {
      cookie: 'admin_token=mock'
    }
  });

  // We can also test the exception logic directly
  console.log('Test file created.');
}
test();
