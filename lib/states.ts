export interface IndianState {
  name: string;
  code: string;
}

export const INDIAN_STATES: IndianState[] = [
  { name: 'Delhi', code: '07' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Haryana', code: '06' },
  { name: 'Punjab', code: '03' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Gujarat', code: '24' },
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'West Bengal', code: '19' },
  { name: 'Bihar', code: '10' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'Chandigarh', code: '04' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Jammu and Kashmir', code: '01' },
  { name: 'Karnataka', code: '29' },
  { name: 'Tamil Nadu', code: '33' },
  { name: 'Telangana', code: '36' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Kerala', code: '32' },
  { name: 'Odisha', code: '21' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Assam', code: '18' },
  { name: 'Goa', code: '30' },
  { name: 'Tripura', code: '16' },
  { name: 'Manipur', code: '14' },
  { name: 'Meghalaya', code: '17' },
  { name: 'Nagaland', code: '13' },
  { name: 'Mizoram', code: '15' },
  { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Sikkim', code: '11' },
  { name: 'Puducherry', code: '34' },
  { name: 'Ladakh', code: '38' },
  { name: 'Daman and Diu', code: '26' },
  { name: 'Dadra and Nagar Haveli', code: '26' },
  { name: 'Andaman and Nicobar Islands', code: '35' },
  { name: 'Lakshadweep', code: '31' },
  { name: 'Other Territory', code: '97' },
];

const STATE_ALIASES: Record<string, string> = {
  dl: '07',
  delhi: '07',
  'new delhi': '07',
  up: '09',
  'uttar pradesh': '09',
  hr: '06',
  haryana: '06',
  pb: '03',
  punjab: '03',
  rj: '08',
  rajasthan: '08',
  mh: '27',
  maharashtra: '27',
  gj: '24',
  gujarat: '24',
  mp: '23',
  'madhya pradesh': '23',
  wb: '19',
  'west bengal': '19',
  br: '10',
  bihar: '10',
  uk: '05',
  uttarakhand: '05',
  uttaranchal: '05',
  ch: '04',
  chandigarh: '04',
  hp: '02',
  'himachal pradesh': '02',
  himachal: '02',
  jk: '01',
  'jammu and kashmir': '01',
  jammu: '01',
  kashmir: '01',
  ka: '29',
  karnataka: '29',
  tn: '33',
  'tamil nadu': '33',
  ts: '36',
  tg: '36',
  telangana: '36',
  ap: '37',
  'andhra pradesh': '37',
  kl: '32',
  kerala: '32',
  od: '21',
  orissa: '21',
  odisha: '21',
  jh: '20',
  jharkhand: '20',
  cg: '22',
  chhattisgarh: '22',
  as: '18',
  assam: '18',
  ga: '30',
  goa: '30',
};

/**
 * Returns official 2-digit GST state code from State Name, alias, or code
 */
export function getStateCode(input?: string): string {
  if (!input) return '';
  const clean = input.trim().toLowerCase();

  // If already a 2-digit code
  const directCode = INDIAN_STATES.find((s) => s.code === input.trim());
  if (directCode) return directCode.code;

  // Direct alias match
  if (STATE_ALIASES[clean]) {
    return STATE_ALIASES[clean];
  }

  // Exact name match
  const exactName = INDIAN_STATES.find((s) => s.name.toLowerCase() === clean);
  if (exactName) return exactName.code;

  // Substring match
  const sub = INDIAN_STATES.find(
    (s) => clean.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(clean)
  );
  if (sub) return sub.code;

  return '';
}

/**
 * Returns 2-digit GST state code from State Name (backward compatibility)
 */
export function getStateCodeByName(stateName: string): string {
  return getStateCode(stateName);
}

/**
 * Returns official state name from code or name
 */
export function getStateName(input?: string): string {
  if (!input) return '';
  const clean = input.trim();

  // Match by code first
  const byCode = INDIAN_STATES.find((s) => s.code === clean);
  if (byCode) return byCode.name;

  // Match by alias or name
  const code = getStateCode(clean);
  if (code) {
    const found = INDIAN_STATES.find((s) => s.code === code);
    if (found) return found.name;
  }

  return clean;
}

/**
 * Returns state object from 2-digit code or GSTIN
 */
export function getStateByGstinOrCode(input: string): IndianState | null {
  if (!input) return null;
  const clean = input.trim();
  const code = clean.length >= 2 ? clean.substring(0, 2) : clean;
  return INDIAN_STATES.find((s) => s.code === code) || null;
}

/**
 * Detect state from a physical address text or pincode
 */
export function detectStateFromAddress(address: string): IndianState | null {
  if (!address) return null;
  const text = address.toLowerCase();

  // Check Delhi pincodes (110xxx) or keywords
  if (/\b110\d{3}\b/.test(text) || text.includes('delhi') || text.includes('badli') || text.includes('chandni chowk') || text.includes('karol bagh')) {
    return { name: 'Delhi', code: '07' };
  }

  // Check Uttar Pradesh pincodes (20xxxx) or keywords
  if (/\b20\d{4}\b/.test(text) || text.includes('noida') || text.includes('ghaziabad') || text.includes('agra') || text.includes('lucknow') || text.includes('kanpur') || text.includes('meerut')) {
    return { name: 'Uttar Pradesh', code: '09' };
  }

  // Check Haryana pincodes (12xxxx) or keywords
  if (/\b12\d{4}\b/.test(text) || text.includes('gurgaon') || text.includes('gurugram') || text.includes('faridabad') || text.includes('panipat') || text.includes('kundli') || text.includes('sonipat') || text.includes('rohtak') || text.includes('ambala')) {
    return { name: 'Haryana', code: '06' };
  }

  // Check Maharashtra (40xxxx)
  if (/\b40\d{4}\b/.test(text) || text.includes('mumbai') || text.includes('pune') || text.includes('thane') || text.includes('nagpur') || text.includes('nashik')) {
    return { name: 'Maharashtra', code: '27' };
  }

  // Check Rajasthan (30xxxx)
  if (/\b30\d{4}\b/.test(text) || text.includes('jaipur') || text.includes('jodhpur') || text.includes('udaipur') || text.includes('kota')) {
    return { name: 'Rajasthan', code: '08' };
  }

  // Check Punjab (14xxxx)
  if (/\b14\d{4}\b/.test(text) || text.includes('ludhiana') || text.includes('amritsar') || text.includes('jalandhar')) {
    return { name: 'Punjab', code: '03' };
  }

  // Check other states by name in text
  for (const st of INDIAN_STATES) {
    if (text.includes(st.name.toLowerCase())) {
      return st;
    }
  }

  return null;
}
