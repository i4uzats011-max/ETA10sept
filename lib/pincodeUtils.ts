/**
 * PIN Code & Address Auto-Detection Utilities
 *
 * Automatically detects 6-digit Indian PIN codes from address text
 * and provides city/area to PIN code search for cargo & transport hubs.
 */

export interface PincodeEntry {
  pincode: string;
  area: string;
  city: string;
  district: string;
  state: string;
  stateCode: string;
}

// Extensive dictionary of major commercial, industrial, cargo & transport hubs in India
export const POPULAR_PINCODES: PincodeEntry[] = [
  // Delhi
  { pincode: '110042', area: 'Badli / Badli Industrial Area', city: 'Delhi', district: 'North West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110039', area: 'Bawana / Bawana Industrial Area', city: 'Delhi', district: 'North West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110040', area: 'Narela / Narela DSIIDC', city: 'Delhi', district: 'North Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110006', area: 'Chandni Chowk / Sadar Bazar', city: 'Delhi', district: 'Central Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110005', area: 'Karol Bagh / Anand Parbat', city: 'Delhi', district: 'Central Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110031', area: 'Gandhi Nagar / Geeta Colony', city: 'Delhi', district: 'East Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110020', area: 'Okhla Industrial Area Phase I/II/III', city: 'Delhi', district: 'South Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110028', area: 'Naraina Industrial Area / Mayapuri', city: 'Delhi', district: 'West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110015', area: 'Kirti Nagar / Moti Nagar / Zakhira', city: 'Delhi', district: 'West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110033', area: 'Adarsh Nagar / Jahangirpuri', city: 'Delhi', district: 'North West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110085', area: 'Rohini Sector 1 to 24', city: 'Delhi', district: 'North West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110034', area: 'Pitampura / Shakurpur / Lawrence Road', city: 'Delhi', district: 'North West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110052', area: 'Ashok Vihar / Wazirpur Industrial Area', city: 'Delhi', district: 'North West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110007', area: 'Kashmere Gate / Mori Gate / Kamla Nagar', city: 'Delhi', district: 'North Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110002', area: 'Daryaganj / Delhi Gate', city: 'Delhi', district: 'Central Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110001', area: 'Connaught Place / Barakhamba Road', city: 'Delhi', district: 'New Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110044', area: 'Tughlakabad / Badarpur / Mohan Co-op', city: 'Delhi', district: 'South Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110041', area: 'Nangloi / Mundka Industrial Area', city: 'Delhi', district: 'West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110043', area: 'Najafgarh / Matiala', city: 'Delhi', district: 'South West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110077', area: 'Dwarka / Sector 1-23', city: 'Delhi', district: 'South West Delhi', state: 'Delhi', stateCode: '07' },
  { pincode: '110092', area: 'Laxmi Nagar / Shakarpur / Anand Vihar', city: 'Delhi', district: 'East Delhi', state: 'Delhi', stateCode: '07' },

  // Haryana (Kundli, Gurgaon, Faridabad, Panipat, Sonipat, etc.)
  { pincode: '131028', area: 'Kundli / Kundli Industrial Area / HSIIDC', city: 'Sonipat', district: 'Sonipat', state: 'Haryana', stateCode: '06' },
  { pincode: '131001', area: 'Sonipat City / Murthal', city: 'Sonipat', district: 'Sonipat', state: 'Haryana', stateCode: '06' },
  { pincode: '131029', area: 'Rai Industrial Area', city: 'Sonipat', district: 'Sonipat', state: 'Haryana', stateCode: '06' },
  { pincode: '122001', area: 'Gurgaon Old City / Sadar Bazar', city: 'Gurugram', district: 'Gurugram', state: 'Haryana', stateCode: '06' },
  { pincode: '122016', area: 'Udyog Vihar Phase I-V / DLF Phase 1-3', city: 'Gurugram', district: 'Gurugram', state: 'Haryana', stateCode: '06' },
  { pincode: '122050', area: 'Manesar / IMT Manesar', city: 'Gurugram', district: 'Gurugram', state: 'Haryana', stateCode: '06' },
  { pincode: '121001', area: 'Faridabad Old / NIT', city: 'Faridabad', district: 'Faridabad', state: 'Haryana', stateCode: '06' },
  { pincode: '121003', area: 'Faridabad Sector 1-15 / Industrial Area', city: 'Faridabad', district: 'Faridabad', state: 'Haryana', stateCode: '06' },
  { pincode: '121004', area: 'Ballabgarh Industrial Area', city: 'Faridabad', district: 'Faridabad', state: 'Haryana', stateCode: '06' },
  { pincode: '132103', area: 'Panipat / Textile Market', city: 'Panipat', district: 'Panipat', state: 'Haryana', stateCode: '06' },
  { pincode: '132001', area: 'Karnal City / Industrial Area', city: 'Karnal', district: 'Karnal', state: 'Haryana', stateCode: '06' },
  { pincode: '134109', area: 'Panchkula / Industrial Area', city: 'Panchkula', district: 'Panchkula', state: 'Haryana', stateCode: '06' },
  { pincode: '133001', area: 'Ambala City / Cantt', city: 'Ambala', district: 'Ambala', state: 'Haryana', stateCode: '06' },
  { pincode: '124001', area: 'Rohtak City / Transport Nagar', city: 'Rohtak', district: 'Rohtak', state: 'Haryana', stateCode: '06' },
  { pincode: '125001', area: 'Hisar / Auto Market', city: 'Hisar', district: 'Hisar', state: 'Haryana', stateCode: '06' },
  { pincode: '124507', area: 'Bahadurgarh / M.I.E. Industrial Area', city: 'Jhajjar', district: 'Jhajjar', state: 'Haryana', stateCode: '06' },

  // Uttar Pradesh (Noida, Greater Noida, Ghaziabad, Kanpur, Agra, etc.)
  { pincode: '201301', area: 'Noida Sector 1 to 15 / Sector 10', city: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201307', area: 'Noida Sector 57, 58, 59, 60, 62 Industrial Area', city: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201305', area: 'Noida Phase II / Hosiery Complex', city: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201306', area: 'Greater Noida / Kasna / Surajpur Site 4', city: 'Greater Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201310', area: 'Greater Noida Knowledge Park / Pari Chowk', city: 'Greater Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201001', area: 'Ghaziabad City / Navyug Market', city: 'Ghaziabad', district: 'Ghaziabad', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201009', area: 'Loni Industrial Area', city: 'Ghaziabad', district: 'Ghaziabad', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201010', area: 'Sahibabad Industrial Area / Mohan Nagar', city: 'Ghaziabad', district: 'Ghaziabad', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '201012', area: 'Kavi Nagar / Bulandshahr Road Industrial Area', city: 'Ghaziabad', district: 'Ghaziabad', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '282001', area: 'Agra Fort / Sanjay Place', city: 'Agra', district: 'Agra', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '282007', area: 'Sikandra Industrial Area', city: 'Agra', district: 'Agra', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '208001', area: 'Kanpur Collectorganj / Nayaganj', city: 'Kanpur', district: 'Kanpur Nagar', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '208022', area: 'Panki Industrial Area / Fazalganj', city: 'Kanpur', district: 'Kanpur Nagar', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '226001', area: 'Lucknow Hazratganj / Aminabad', city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '226008', area: 'Sarojini Nagar / Amausi Industrial Area', city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '250001', area: 'Meerut Cantt / Begum Bridge', city: 'Meerut', district: 'Meerut', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '250002', area: 'Partapur Industrial Area', city: 'Meerut', district: 'Meerut', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '221001', area: 'Varanasi Chowk / Godowlia', city: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '202001', area: 'Aligarh Railway Station / GT Road', city: 'Aligarh', district: 'Aligarh', state: 'Uttar Pradesh', stateCode: '09' },
  { pincode: '281001', area: 'Mathura Junction / Dholi Pyau', city: 'Mathura', district: 'Mathura', state: 'Uttar Pradesh', stateCode: '09' },

  // Maharashtra (Mumbai, Bhiwandi, Thane, Pune, etc.)
  { pincode: '421302', area: 'Bhiwandi / Mankoli / Rahnal / Anjur Phata', city: 'Bhiwandi', district: 'Thane', state: 'Maharashtra', stateCode: '27' },
  { pincode: '400001', area: 'Mumbai Fort / Churchgate / Crawford Market', city: 'Mumbai', district: 'Mumbai City', state: 'Maharashtra', stateCode: '27' },
  { pincode: '400003', area: 'Masjid Bunder / Mandvi / Iron Market', city: 'Mumbai', district: 'Mumbai City', state: 'Maharashtra', stateCode: '27' },
  { pincode: '400009', area: 'Chinchbunder / Dongri', city: 'Mumbai', district: 'Mumbai City', state: 'Maharashtra', stateCode: '27' },
  { pincode: '400069', area: 'Andheri East / MIDC / SEEPZ', city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra', stateCode: '27' },
  { pincode: '400705', area: 'Turbhe / Sanpada / APMC Market', city: 'Navi Mumbai', district: 'Thane', state: 'Maharashtra', stateCode: '27' },
  { pincode: '400703', area: 'Vashi / APMC Fruit & Grain Market', city: 'Navi Mumbai', district: 'Thane', state: 'Maharashtra', stateCode: '27' },
  { pincode: '400601', area: 'Thane West / Wagle Estate Industrial Area', city: 'Thane', district: 'Thane', state: 'Maharashtra', stateCode: '27' },
  { pincode: '411001', area: 'Pune Station / Camp / Nana Peth', city: 'Pune', district: 'Pune', state: 'Maharashtra', stateCode: '27' },
  { pincode: '411018', area: 'Pimpri / Chinchwad / Bhosari MIDC', city: 'Pune', district: 'Pune', state: 'Maharashtra', stateCode: '27' },

  // Gujarat (Surat, Ahmedabad, Vadodara, Rajkot)
  { pincode: '395002', area: 'Surat Ring Road / Textile Market / Begampura', city: 'Surat', district: 'Surat', state: 'Gujarat', stateCode: '24' },
  { pincode: '395003', area: 'Varachha / Diamond Market / Mini Bazar', city: 'Surat', district: 'Surat', state: 'Gujarat', stateCode: '24' },
  { pincode: '394230', area: 'Sachin GIDC / Diamond SEZ', city: 'Surat', district: 'Surat', state: 'Gujarat', stateCode: '24' },
  { pincode: '380001', area: 'Ahmedabad Kalupur / Relief Road', city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', stateCode: '24' },
  { pincode: '380002', area: 'Sarangpur / New Cloth Market', city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', stateCode: '24' },
  { pincode: '382445', area: 'Naroda GIDC / Industrial Estate', city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', stateCode: '24' },
  { pincode: '382415', area: 'Changodar / Moraiya Industrial Area', city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', stateCode: '24' },
  { pincode: '390001', area: 'Vadodara Mandvi / Alkapuri', city: 'Vadodara', district: 'Vadodara', state: 'Gujarat', stateCode: '24' },
  { pincode: '390010', area: 'Makarpura GIDC Industrial Estate', city: 'Vadodara', district: 'Vadodara', state: 'Gujarat', stateCode: '24' },
  { pincode: '360001', area: 'Rajkot Dharmendra Road / Dhebar Road', city: 'Rajkot', district: 'Rajkot', state: 'Gujarat', stateCode: '24' },
  { pincode: '360002', area: 'Aji GIDC / Bhaktinagar Industrial Area', city: 'Rajkot', district: 'Rajkot', state: 'Gujarat', stateCode: '24' },

  // Rajasthan (Jaipur, Jodhpur, Bhiwadi, Kota)
  { pincode: '302001', area: 'Jaipur MI Road / Johari Bazar', city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', stateCode: '08' },
  { pincode: '302013', area: 'VKIA / Vishwakarma Industrial Area', city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', stateCode: '08' },
  { pincode: '302020', area: 'Mansarovar / RIICO Industrial Area', city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', stateCode: '08' },
  { pincode: '301019', area: 'Bhiwadi / RIICO Industrial Area / Chopanki', city: 'Bhiwadi', district: 'Alwar', state: 'Rajasthan', stateCode: '08' },
  { pincode: '342001', area: 'Jodhpur Railway Station / Sohati Gate', city: 'Jodhpur', district: 'Jodhpur', state: 'Rajasthan', stateCode: '08' },
  { pincode: '342005', area: 'Basni Industrial Area Phase 1-2', city: 'Jodhpur', district: 'Jodhpur', state: 'Rajasthan', stateCode: '08' },

  // Punjab (Ludhiana, Amritsar, Jalandhar)
  { pincode: '141001', area: 'Ludhiana Chaura Bazar / Clock Tower', city: 'Ludhiana', district: 'Ludhiana', state: 'Punjab', stateCode: '03' },
  { pincode: '141003', area: 'Industrial Area A & B / Cheema Chowk', city: 'Ludhiana', district: 'Ludhiana', state: 'Punjab', stateCode: '03' },
  { pincode: '141010', area: 'Focal Point Phase I-VIII', city: 'Ludhiana', district: 'Ludhiana', state: 'Punjab', stateCode: '03' },
  { pincode: '144001', area: 'Jalandhar GT Road / Sports Goods Market', city: 'Jalandhar', district: 'Jalandhar', state: 'Punjab', stateCode: '03' },
  { pincode: '143001', area: 'Amritsar Hall Gate / Katra Ahluwalia', city: 'Amritsar', district: 'Amritsar', state: 'Punjab', stateCode: '03' },

  // West Bengal (Kolkata, Howrah)
  { pincode: '700001', area: 'Kolkata BBD Bagh / Dalhousie', city: 'Kolkata', district: 'Kolkata', state: 'West Bengal', stateCode: '19' },
  { pincode: '700007', area: 'Burrabazar / Posta / Cotton Street', city: 'Kolkata', district: 'Kolkata', state: 'West Bengal', stateCode: '19' },
  { pincode: '711101', area: 'Howrah Station / Kadamtala', city: 'Howrah', district: 'Howrah', state: 'West Bengal', stateCode: '19' },
];

/**
 * Extract an explicit 6-digit PIN code from an address string
 */
export function extractPincodeFromAddress(address: string): string | null {
  if (!address) return null;
  // Match standard 6-digit Indian PIN code starting with digits 1-9
  const match = address.match(/\b([1-9][0-9]{5})\b/);
  return match ? match[1] : null;
}

/**
 * Search PIN codes based on address keywords, areas, localities, or PIN code digits
 */
export function searchPincodes(query: string, maxResults: number = 8): PincodeEntry[] {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean || clean.length < 2) return [];

  // 1. Direct PIN code prefix match
  if (/^\d{2,6}$/.test(clean)) {
    return POPULAR_PINCODES.filter((p) => p.pincode.startsWith(clean)).slice(0, maxResults);
  }

  // 2. Tokenize search words from address
  const words = clean
    .split(/[\s,.\-\/\\]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !['road', 'street', 'floor', 'plot', 'house', 'near', 'opp', 'lane', 'block', 'sector', 'gali', 'phase'].includes(w));

  // Score matches
  const scored: Array<{ entry: PincodeEntry; score: number }> = [];

  for (const entry of POPULAR_PINCODES) {
    let score = 0;
    const entryText = `${entry.area} ${entry.city} ${entry.district} ${entry.state}`.toLowerCase();

    // Check full clean query match
    if (entryText.includes(clean)) {
      score += 15;
    }

    // Check individual significant words
    for (const w of words) {
      if (entry.area.toLowerCase().includes(w)) {
        score += 8;
      } else if (entry.city.toLowerCase().includes(w)) {
        score += 5;
      } else if (entry.district.toLowerCase().includes(w)) {
        score += 4;
      } else if (entry.state.toLowerCase().includes(w)) {
        score += 2;
      }
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.entry);
}

/**
 * Auto-detect the best PIN code candidate directly from a full address string
 */
export function autoDetectPincodeFromAddress(address: string): PincodeEntry | null {
  if (!address) return null;

  // 1. If explicit 6-digit PIN code exists in address
  const explicit = extractPincodeFromAddress(address);
  if (explicit) {
    const known = POPULAR_PINCODES.find((p) => p.pincode === explicit);
    if (known) return known;
    return {
      pincode: explicit,
      area: 'Detected from Address',
      city: '',
      district: '',
      state: '',
      stateCode: '',
    };
  }

  // 2. Search by address text
  const results = searchPincodes(address, 1);
  return results.length > 0 ? results[0] : null;
}
