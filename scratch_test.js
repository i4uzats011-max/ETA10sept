// Unit test script for Container Tracking application logic
const { parse } = require('csv-parse/sync');

console.log('=== TEST 1: CSV Parsing & Header Normalization ===');

const csvContent = `volumem³,SUB MARKA,Main_Marka,Receipt,Quantity,Warehouse entry,English,commodity,Container,Shipping Line
12.5,SUB-1,MAIN-A,REC-9901,50,WE-445,Industrial Components,Electronics,USI 01,MSC
15.0,SUB-2,MAIN-B,REC-9902,100,WE-446,Machinery Parts,Machinery,USI 02,MAERSK`;

const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
const rawHeaders = Object.keys(records[0]);

const findHeader = (candidates) => {
  return rawHeaders.find((h) => {
    const cleaned = h.trim().toLowerCase();
    return candidates.some((c) => c.trim().toLowerCase() === cleaned);
  });
};

const containerHeader = findHeader(['Container', 'containerNumber']);
const volumeHeader = findHeader(['volumem', 'volumem³', 'volumemü', 'volume']);
const subMarkHeader = findHeader(['SUB MARK', 'SUB MARKA', 'subMarka']);
const mainMarkHeader = findHeader(['Main_Mark', 'Main_Marka', 'mainMarka']);

if (containerHeader !== 'Container') throw new Error('Container header detection failed');
if (volumeHeader !== 'volumem³') throw new Error('Volume header alias failed');
if (subMarkHeader !== 'SUB MARKA') throw new Error('SubMark alias failed');
if (mainMarkHeader !== 'Main_Marka') throw new Error('MainMark alias failed');
console.log('✓ Header Normalization Test Passed!');

console.log('\n=== TEST 2: +7 Days Filing Buffer Addition ===');

function addFilingBufferDays(etaDateInput, daysToAdd = 7) {
  const dateMatch = String(etaDateInput).match(/\d{4}-\d{2}-\d{2}/);
  let baseDate = null;
  if (dateMatch) {
    baseDate = new Date(dateMatch[0]);
  } else if (!isNaN(new Date(etaDateInput).getTime())) {
    baseDate = new Date(etaDateInput);
  }

  if (!baseDate || isNaN(baseDate.getTime())) return 'N/A';

  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = String(baseDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const rawEtaFromApi = '2026-09-15';
const etaWithBuffer = addFilingBufferDays(rawEtaFromApi, 7);
console.log(`Raw ETA from API: ${rawEtaFromApi} → Adjusted (+7 Days Filing Buffer): ${etaWithBuffer}`);

if (etaWithBuffer !== '2026-09-22') throw new Error('+7 Days Filing Buffer test failed!');
console.log('✓ +7 Days Filing Buffer Test Passed!');

console.log('\n=== TEST 3: Container Arrival String Formatting ===');

function formatContainerArrival(containerAlias, etaStr, today = new Date('2026-09-07T00:00:00Z')) {
  if (!etaStr || etaStr === 'N/A') return `${containerAlias} ETA status is currently unconfirmed or pending.`;
  
  const etaDate = new Date(etaStr);
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(etaDate);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const dayName = etaDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dd = String(etaDate.getDate()).padStart(2, '0');
  const mm = String(etaDate.getMonth() + 1).padStart(2, '0');
  const yy = String(etaDate.getFullYear()).slice(-2);
  const formattedDate = `${dd}/${mm}/${yy}`;

  if (daysRemaining > 0) {
    return `${containerAlias} is arriving on ${dayName}, ${formattedDate} (${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining from today).`;
  }
  return `${containerAlias} arrived on ${dayName}, ${formattedDate}.`;
}

const arrivalStr = formatContainerArrival('USI 1', etaWithBuffer, new Date('2026-09-07T00:00:00Z'));
console.log('Formatted Arrival Banner:', arrivalStr);
if (!arrivalStr.includes('USI 1 is arriving on Tuesday, 22/09/26 (15 days remaining from today).')) throw new Error('Container string format mismatch');

console.log('✓ Container Arrival Formatting Test Passed!');

console.log('\nALL LOGIC UNIT TESTS PASSED CLEANLY!');
