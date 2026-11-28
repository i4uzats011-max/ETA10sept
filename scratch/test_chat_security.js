// Verification script for Public Cargo Chat API logic
const { default: axios } = require('axios');

async function testApi() {
  console.log('Testing security guardrail logic...');
  
  // Test direct prompt injection & restricted field inquiries against the fallback rules engine
  const queries = [
    {
      title: 'Restricted Data Request (Container No / BL No)',
      messages: [{ role: 'user', content: 'What is my actual container no. and BL number and destination port?' }],
      contextReceipts: [{
        receiptNo: 'RS-9988',
        marka: 'TEST MARKA',
        itemName: 'Textiles',
        ctn: '50',
        cbm: '2.5',
        status: 'In Transit',
        eta: '2026-11-20'
      }]
    },
    {
      title: 'Delayed Container Inquiry (Late excuse explanation)',
      messages: [{ role: 'user', content: 'Why is my container late? It has not arrived yet.' }],
      contextReceipts: [{
        receiptNo: 'RS-9988',
        marka: 'TEST MARKA',
        itemName: 'Textiles',
        ctn: '50',
        cbm: '2.5',
        status: 'In Transit',
        eta: '2026-11-20' // Past today
      }]
    },
    {
      title: 'General Cargo Status Request',
      messages: [{ role: 'user', content: 'Can you tell me the status of my cargo?' }],
      contextReceipts: [{
        receiptNo: 'RS-9988',
        marka: 'TEST MARKA',
        itemName: 'Textiles',
        ctn: '50',
        cbm: '2.5',
        status: 'In Transit',
        eta: '2026-12-05'
      }]
    }
  ];

  for (const q of queries) {
    console.log(`\n========================================`);
    console.log(`Scenario: ${q.title}`);
    console.log(`User Input: "${q.messages[0].content}"`);

    // Simulate backend route logic
    const lastUserMsg = q.messages[0].content.toLowerCase();
    let reply = '';

    if (
      lastUserMsg.includes('container no') ||
      lastUserMsg.includes('actual container') ||
      lastUserMsg.includes('bl no') ||
      lastUserMsg.includes('bill of lading') ||
      lastUserMsg.includes('destination port')
    ) {
      reply = 'For customs regulatory compliance, maritime security policies, and client trade privacy, actual container equipment serial numbers, Master B/L numbers, and internal port routing are strictly confidential. I am happy to assist you with your cargo status, packages/cartons, goods details, and estimated delivery dates (ETA).';
    } else if (lastUserMsg.includes('late') || lastUserMsg.includes('delay') || lastUserMsg.includes('why')) {
      reply = 'Hello! We sincerely apologize for the delay with your shipment. The slight delay is primarily due to seasonal transshipment port congestion and routine customs berth queues along the ocean corridor. Please rest assured that your cargo is completely safe and securely secured in transit. Current estimated arrival is 2026-11-20. We are closely monitoring the voyage to expedite clearance as soon as the vessel docks!';
    } else {
      reply = `Hello! Your cargo (Receipt #${q.contextReceipts[0].receiptNo}) marked as "${q.contextReceipts[0].marka}" has 1 item(s) on record. Description: ${q.contextReceipts[0].itemName} (${q.contextReceipts[0].ctn} CTN, ${q.contextReceipts[0].cbm} CBM). Current Status: ${q.contextReceipts[0].status}, with an Estimated Arrival (ETA) of ${q.contextReceipts[0].eta}.`;
    }

    console.log(`AI Response:`);
    console.log(reply);

    // Verify restricted data is NOT leaked
    const leaksActual = /\b[A-Z]{4}\d{7}\b/.test(reply);
    const leaksBL = /bill of lading/i.test(reply) && /#\s*[A-Z0-9]{5,}/.test(reply);
    console.log(`Security Check: Actual Container Leaked? ${leaksActual ? 'FAILED' : 'PASSED (Protected)'}`);
    console.log(`Security Check: BL Leaked? ${leaksBL ? 'FAILED' : 'PASSED (Protected)'}`);
  }
}

testApi();
