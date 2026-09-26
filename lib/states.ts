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

/**
 * Returns 2-digit GST state code from State Name
 */
export function getStateCodeByName(stateName: string): string {
  if (!stateName) return '';
  const clean = stateName.trim().toLowerCase();
  const found = INDIAN_STATES.find(
    (s) => s.name.toLowerCase() === clean || clean.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(clean)
  );
  return found ? found.code : '';
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
