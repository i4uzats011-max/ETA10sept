const fs = require('fs');

// 1. Resolve app/api/billing/route.ts
let routeContent = fs.readFileSync('app/api/billing/route.ts', 'utf-8');
const routeConflictRegex = /<<<<<<< HEAD[\s\S]*?=======[\s\S]*?>>>>>>> [a-f0-9]+/g;
routeContent = routeContent.replace(routeConflictRegex, `import { isAnyAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { recordEditLog } from '@/lib/auditLog';
import { generateInvoiceNumberFromReceipt } from '@/lib/invoiceUtils';

/**
 * Resolve a unique bill / invoice number taking receipt as base, with last 2 or 3 digits randomized.
 */
async function resolveUniqueBillNumber(rawReceipt: string, requestedBillNumber?: string): Promise<string> {
  const cleanReceipt = String(rawReceipt || '').trim();

  if (requestedBillNumber && requestedBillNumber.trim()) {
    const custom = requestedBillNumber.trim();
    const exists = await Bill.findOne({ billNumber: custom }).select('_id').lean();
    if (!exists) {
      return custom;
    }
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = generateInvoiceNumberFromReceipt(cleanReceipt);
    const exists = await Bill.findOne({ billNumber: candidate }).select('_id').lean();
    if (!exists) {
      return candidate;
    }
  }

  return \`\${cleanReceipt.slice(0, Math.max(1, cleanReceipt.length - 3))}\${Math.floor(100 + Math.random() * 900)}\`;
}`);

fs.writeFileSync('app/api/billing/route.ts', routeContent, 'utf-8');
console.log('Resolved app/api/billing/route.ts');
