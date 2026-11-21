export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: 'BANK_HOLIDAY' | 'TAX_TDS' | 'GST' | 'FESTIVAL';
  description?: string;
  isStatutory?: boolean;
}

// Indian Bank Holidays, Festivals & Statutory Tax Compliance Dates
export const STATUTORY_COMPLIANCE_PATTERNS = [
  {
    dayOfMonth: 7,
    category: 'TAX_TDS' as const,
    title: 'TDS / TCS Monthly Deposit Due Date',
    description: 'Challan ITNS 281 deposit for TDS/TCS deducted in previous month under Income Tax Act.',
  },
  {
    dayOfMonth: 11,
    category: 'GST' as const,
    title: 'GSTR-1 Monthly Return Filing Due Date',
    description: 'Details of outward supplies of goods and services for regular taxpayers.',
  },
  {
    dayOfMonth: 13,
    category: 'GST' as const,
    title: 'GSTR-1 IFF (QRMP Scheme)',
    description: 'Invoice Furnishing Facility for taxpayers under QRMP scheme.',
  },
  {
    dayOfMonth: 20,
    category: 'GST' as const,
    title: 'GSTR-3B Monthly Return & Tax Payment',
    description: 'Summary return of inward/outward supplies and input tax credit payment.',
  },
];

// Specific quarterly and annual tax due dates
export const SPECIAL_TAX_DATES: CalendarEvent[] = [
  // Advance Tax Installments
  {
    id: 'tax-adv-q1',
    date: '2026-06-15',
    category: 'TAX_TDS',
    title: 'Advance Tax - 1st Installment (15%)',
    description: 'Due date for 1st installment of advance income tax for FY 2026-27.',
  },
  {
    id: 'tax-adv-q2',
    date: '2026-09-15',
    category: 'TAX_TDS',
    title: 'Advance Tax - 2nd Installment (45%)',
    description: 'Due date for 2nd installment of advance income tax.',
  },
  {
    id: 'tax-adv-q3',
    date: '2026-12-15',
    category: 'TAX_TDS',
    title: 'Advance Tax - 3rd Installment (75%)',
    description: 'Due date for 3rd installment of advance income tax.',
  },
  {
    id: 'tax-adv-q4',
    date: '2027-03-15',
    category: 'TAX_TDS',
    title: 'Advance Tax - 4th Installment (100%)',
    description: 'Final installment of advance income tax for the financial year.',
  },
  // Quarterly TDS Returns (Form 24Q, 26Q, 27Q)
  {
    id: 'tds-q1',
    date: '2026-07-31',
    category: 'TAX_TDS',
    title: 'Quarterly TDS Return (Q1 - Apr to Jun)',
    description: 'Filing of quarterly TDS statement Form 24Q & 26Q for Q1.',
  },
  {
    id: 'tds-q2',
    date: '2026-10-31',
    category: 'TAX_TDS',
    title: 'Quarterly TDS Return (Q2 - Jul to Sep)',
    description: 'Filing of quarterly TDS statement Form 24Q & 26Q for Q2.',
  },
  {
    id: 'tds-q3',
    date: '2027-01-31',
    category: 'TAX_TDS',
    title: 'Quarterly TDS Return (Q3 - Oct to Dec)',
    description: 'Filing of quarterly TDS statement Form 24Q & 26Q for Q3.',
  },
  {
    id: 'tds-q4',
    date: '2027-05-31',
    category: 'TAX_TDS',
    title: 'Quarterly TDS Return (Q4 - Jan to Mar)',
    description: 'Filing of quarterly TDS statement Form 24Q & 26Q for Q4.',
  },
  // ITR Filing
  {
    id: 'itr-individual',
    date: '2026-07-31',
    category: 'TAX_TDS',
    title: 'ITR Filing Due Date (Non-Audit Cases)',
    description: 'Due date for filing Income Tax Return for individuals and non-audit entities.',
  },
  {
    id: 'itr-audit',
    date: '2026-10-31',
    category: 'TAX_TDS',
    title: 'ITR Filing Due Date (Audit Cases)',
    description: 'Due date for corporate and audit assesses under Section 44AB.',
  },
  // Annual GST Returns
  {
    id: 'gst-gstr9',
    date: '2026-12-31',
    category: 'GST',
    title: 'GSTR-9 & GSTR-9C Annual Return',
    description: 'Annual return and reconciliation statement for registered GST taxpayers.',
  },
];

// Major Indian Bank Holidays and Festivals
export const FIXED_HOLIDAYS_AND_FESTIVALS: CalendarEvent[] = [
  // 2026 Holidays & Festivals
  { id: 'h-2026-01-26', date: '2026-01-26', category: 'BANK_HOLIDAY', title: 'Republic Day (गणतंत्र दिवस)', description: 'National Bank Holiday' },
  { id: 'f-2026-02-15', date: '2026-02-15', category: 'FESTIVAL', title: 'Maha Shivratri (महाशिवरात्रि)', description: 'Gazetted Holiday' },
  { id: 'f-2026-03-04', date: '2026-03-04', category: 'FESTIVAL', title: 'Holi (होली)', description: 'Festival of colors & Bank Holiday' },
  { id: 'f-2026-03-20', date: '2026-03-20', category: 'FESTIVAL', title: 'Eid-ul-Fitr (ईद-उल-फ़ित्र)', description: 'Ramadan culmination & Gazetted Holiday' },
  { id: 'h-2026-04-01', date: '2026-04-01', category: 'BANK_HOLIDAY', title: 'Annual Bank Closing (बैंक वार्षिक लेखाबंदी)', description: 'Commercial banks annual accounts closing' },
  { id: 'f-2026-04-03', date: '2026-04-03', category: 'BANK_HOLIDAY', title: 'Good Friday (गुड फ्राइडे)', description: 'National Bank Holiday' },
  { id: 'f-2026-04-14', date: '2026-04-14', category: 'BANK_HOLIDAY', title: 'Dr. B.R. Ambedkar Jayanti', description: 'National Bank Holiday' },
  { id: 'f-2026-05-01', date: '2026-05-01', category: 'BANK_HOLIDAY', title: 'Maharashtra Day / May Day', description: 'Bank Holiday in several states' },
  { id: 'f-2026-05-27', date: '2026-05-27', category: 'FESTIVAL', title: 'Eid-ul-Adha / Bakrid (बक़रीद)', description: 'Gazetted Holiday' },
  { id: 'f-2026-06-26', date: '2026-06-26', category: 'FESTIVAL', title: 'Muharram / Ashura (मोहर्रम)', description: 'Gazetted Bank Holiday' },
  { id: 'h-2026-08-15', date: '2026-08-15', category: 'BANK_HOLIDAY', title: 'Independence Day (स्वतंत्रता दिवस)', description: 'National Bank Holiday' },
  { id: 'f-2026-08-28', date: '2026-08-28', category: 'FESTIVAL', title: 'Raksha Bandhan (रक्षाबंधन)', description: 'Festival Holiday' },
  { id: 'f-2026-09-04', date: '2026-09-04', category: 'FESTIVAL', title: 'Janmashtami (श्री कृष्ण जन्माष्टमी)', description: 'Gazetted Bank Holiday' },
  { id: 'f-2026-09-14', date: '2026-09-14', category: 'FESTIVAL', title: 'Ganesh Chaturthi (गणेश चतुर्थी)', description: 'Bank Holiday in key states' },
  { id: 'h-2026-10-02', date: '2026-10-02', category: 'BANK_HOLIDAY', title: 'Mahatma Gandhi Jayanti (गाँधी जयंती)', description: 'National Bank Holiday' },
  { id: 'f-2026-10-20', date: '2026-10-20', category: 'FESTIVAL', title: 'Dussehra / Vijayadashami (दशहरा)', description: 'National Bank Holiday' },
  { id: 'f-2026-11-08', date: '2026-11-08', category: 'FESTIVAL', title: 'Diwali / Deepawali (दीपावली / लक्ष्मी पूजन)', description: 'National Festival & Holiday' },
  { id: 'f-2026-11-09', date: '2026-11-09', category: 'BANK_HOLIDAY', title: 'Govardhan Puja / Diwali New Year', description: 'Commercial Bank Holiday' },
  { id: 'f-2026-11-10', date: '2026-11-10', category: 'FESTIVAL', title: 'Bhai Dooj (भाई दूज)', description: 'Festival Holiday' },
  { id: 'f-2026-11-15', date: '2026-11-15', category: 'FESTIVAL', title: 'Chhath Puja (छठ पूजा)', description: 'Regional Bank Holiday' },
  { id: 'f-2026-11-24', date: '2026-11-24', category: 'BANK_HOLIDAY', title: 'Guru Nanak Jayanti (गुरु नानक जयंती)', description: 'Gazetted Holiday' },
  { id: 'h-2026-12-25', date: '2026-12-25', category: 'BANK_HOLIDAY', title: 'Christmas Day (क्रिसमस)', description: 'National Bank Holiday' },
];

/**
 * Returns all events for a given year and month (1-indexed month: 1=Jan, 12=Dec)
 */
export function getEventsForMonth(year: number, month: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const monthStr = month < 10 ? `0${month}` : `${month}`;

  // 1. Recurring statutory monthly dues (TDS 7th, GSTR-1 11th, GSTR-3B 20th, etc.)
  STATUTORY_COMPLIANCE_PATTERNS.forEach((pattern) => {
    const dayStr = pattern.dayOfMonth < 10 ? `0${pattern.dayOfMonth}` : `${pattern.dayOfMonth}`;
    events.push({
      id: `statutory-${year}-${monthStr}-${dayStr}-${pattern.category}`,
      date: `${year}-${monthStr}-${dayStr}`,
      category: pattern.category,
      title: pattern.title,
      description: pattern.description,
      isStatutory: true,
    });
  });

  // 2. Add second and fourth Saturdays as Bank Holidays
  const daysInMonth = new Date(year, month, 0).getDate();
  let saturdayCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    if (d.getDay() === 6) {
      saturdayCount++;
      if (saturdayCount === 2 || saturdayCount === 4) {
        const dayStr = day < 10 ? `0${day}` : `${day}`;
        events.push({
          id: `bank-sat-${year}-${monthStr}-${dayStr}`,
          date: `${year}-${monthStr}-${dayStr}`,
          category: 'BANK_HOLIDAY',
          title: `${saturdayCount === 2 ? '2nd' : '4th'} Saturday Bank Holiday`,
          description: 'Reserve Bank of India 2nd/4th Saturday official closure.',
        });
      }
    }
  }

  // 3. Match special tax dates
  SPECIAL_TAX_DATES.forEach((ev) => {
    if (ev.date.startsWith(`${year}-${monthStr}`)) {
      events.push(ev);
    }
  });

  // 4. Match fixed holidays & festivals
  FIXED_HOLIDAYS_AND_FESTIVALS.forEach((ev) => {
    if (ev.date.startsWith(`${year}-${monthStr}`)) {
      events.push(ev);
    }
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get events for a specific date (YYYY-MM-DD)
 */
export function getEventsForDate(dateStr: string): CalendarEvent[] {
  const [yearStr, monthStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month) return [];
  const monthEvents = getEventsForMonth(year, month);
  return monthEvents.filter((e) => e.date === dateStr);
}
