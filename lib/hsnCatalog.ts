// Comprehensive Indian GST HSN Directory & Smart Inference Engine
// Covers imported goods, toys, baby care, plastics, garments, electronics, footwear, etc.

export interface HsnItem {
  hsnCode: string;
  itemName: string;
  category: string;
  gstRate: number;
  description: string;
  keywords: string[];
}

export const MASTER_HSN_CATALOG: HsnItem[] = [
  // Baby Products & Infant Care
  {
    hsnCode: '39269099',
    itemName: 'BABY FEEDING BOTTLE',
    category: 'Baby Care & Feeding',
    gstRate: 18,
    description: 'Baby feeding bottles, nipples, silicone teether and feeding accessories of plastics',
    keywords: ['feeding bottle', 'baby bottle', 'nipple', 'sipper', 'milk bottle', 'feeder', 'bottle'],
  },
  {
    hsnCode: '39269099',
    itemName: 'TEETHER & PACIFIER',
    category: 'Baby Care & Feeding',
    gstRate: 18,
    description: 'Baby soother, teether, pacifier, chewable toys made of silicone / plastic',
    keywords: ['teether', 'pacifier', 'soother', 'chewer', 'silicone teether', 'baby chew'],
  },
  {
    hsnCode: '39269099',
    itemName: 'SILICONE BIBS',
    category: 'Baby Care & Feeding',
    gstRate: 18,
    description: 'Silicone waterproof baby bibs with food catcher pocket',
    keywords: ['silicone bib', 'baby bib', 'waterproof bib', 'food catcher', 'bib'],
  },
  {
    hsnCode: '62092090',
    itemName: 'MUSLIN BIBS / COTTON BIBS',
    category: 'Baby Care & Clothing',
    gstRate: 5,
    description: 'Babies garments and clothing accessories of cotton / muslin',
    keywords: ['muslin bib', 'cotton bib', 'cloth bib', 'baby cotton bib'],
  },
  {
    hsnCode: '82141090',
    itemName: 'NAIL GROOMING SET / BABY NAIL CLIPPER',
    category: 'Baby Care & Grooming',
    gstRate: 18,
    description: 'Manicure or pedicure sets, baby nail clippers, nail scissors and files',
    keywords: ['nail grooming', 'nail clipper', 'baby nail cutter', 'manicure set', 'scissors', 'grooming kit'],
  },
  {
    hsnCode: '33079090',
    itemName: 'BABY WIPES / WET WIPES',
    category: 'Baby Care & Toiletries',
    gstRate: 18,
    description: 'Wet wipes, baby cleansing wet tissues, perfumed / non-perfumed wipes',
    keywords: ['baby wipes', 'wet wipes', 'cleansing wipes', 'wet tissue', 'wipes'],
  },
  {
    hsnCode: '87150000',
    itemName: 'BABY STROLLER / PRAM / BUGGY',
    category: 'Baby Transport',
    gstRate: 18,
    description: 'Baby carriages, strollers, prams and parts thereof',
    keywords: ['stroller', 'pram', 'baby stroller', 'baby carriage', 'buggy', 'walker', 'baby walker'],
  },
  {
    hsnCode: '94032090',
    itemName: 'BABY COT / HIGH CHAIR / CRADLE',
    category: 'Baby Furniture',
    gstRate: 18,
    description: 'Baby cribs, cots, high chairs, boosters and metal/plastic furniture',
    keywords: ['baby cot', 'crib', 'high chair', 'cradle', 'baby bed', 'booster chair'],
  },

  // Toys & Games
  {
    hsnCode: '95030030',
    itemName: 'PLASTIC TOYS',
    category: 'Toys & Games',
    gstRate: 12,
    description: 'Plastic toys, building blocks, rattle, pull-along toys, friction toys',
    keywords: ['plastic toy', 'toy', 'toys', 'building blocks', 'rattle', 'friction car', 'action figure', 'doll'],
  },
  {
    hsnCode: '95030010',
    itemName: 'ELECTRONIC & BATTERY OPERATED TOYS',
    category: 'Toys & Games',
    gstRate: 18,
    description: 'Battery operated toys, RC remote control cars, drones, musical toys',
    keywords: ['electronic toy', 'rc car', 'remote car', 'battery toy', 'drone', 'musical toy', 'robot toy'],
  },
  {
    hsnCode: '95030020',
    itemName: 'PLUSH & SOFT TOYS',
    category: 'Toys & Games',
    gstRate: 12,
    description: 'Stuffed plush toys, teddy bears, animal soft toys',
    keywords: ['soft toy', 'plush toy', 'teddy bear', 'stuffed toy'],
  },
  {
    hsnCode: '95030090',
    itemName: 'EDUCATIONAL TOYS & PUZZLES',
    category: 'Toys & Games',
    gstRate: 12,
    description: 'Jigsaw puzzles, educational board games, STEM learning toys',
    keywords: ['puzzle', 'educational toy', 'board game', 'stem toy', 'learning toy', 'brain game'],
  },
  {
    hsnCode: '95044000',
    itemName: 'PLAYING CARDS',
    category: 'Toys & Games',
    gstRate: 18,
    description: 'Playing cards of paper or plastics',
    keywords: ['playing cards', 'cards', 'uno cards', 'poker cards'],
  },

  // Plastic & Household Articles
  {
    hsnCode: '39241090',
    itemName: 'PLASTIC TABLEWARE & KITCHENWARE',
    category: 'Plastics & Household',
    gstRate: 18,
    description: 'Plastic plates, cups, lunch boxes, bowls, food containers',
    keywords: ['lunch box', 'plastic plate', 'plastic cup', 'food container', 'plastic bowl', 'tableware'],
  },
  {
    hsnCode: '39249090',
    itemName: 'PLASTIC HOUSEHOLD ARTICLES',
    category: 'Plastics & Household',
    gstRate: 18,
    description: 'Plastic buckets, dustbins, hangers, organizers, bathroom accessories',
    keywords: ['bucket', 'dustbin', 'hanger', 'organizer', 'storage box', 'basket', 'plastic container'],
  },
  {
    hsnCode: '39269099',
    itemName: 'OTHER ARTICLES OF PLASTICS',
    category: 'Plastics & Household',
    gstRate: 18,
    description: 'General articles of plastics not elsewhere specified',
    keywords: ['plastic article', 'plastic goods', 'silicone product', 'plastic mold', 'plastic parts'],
  },

  // Stainless Steel, Metal & Kitchenware
  {
    hsnCode: '73239390',
    itemName: 'STAINLESS STEEL UTENSILS & KITCHENWARE',
    category: 'Kitchenware & Utensils',
    gstRate: 12,
    description: 'Stainless steel tableware, kitchenware, pots, pans, thermos, flask',
    keywords: ['stainless steel', 'steel bottle', 'thermos', 'flask', 'cookware', 'pan', 'pot', 'steel utensil'],
  },
  {
    hsnCode: '70133700',
    itemName: 'GLASSWARE / GLASS TUMBLERS / MUGS',
    category: 'Kitchenware & Glass',
    gstRate: 18,
    description: 'Glass drinking tumblers, mugs, jars, storage bottles',
    keywords: ['glassware', 'glass cup', 'glass mug', 'tumbler', 'glass bottle', 'jar'],
  },

  // Electronics & Mobile Accessories
  {
    hsnCode: '85183000',
    itemName: 'HEADPHONES & EARPHONES',
    category: 'Consumer Electronics',
    gstRate: 18,
    description: 'Earphones, headphones, TWS earbuds, Bluetooth headsets',
    keywords: ['headphone', 'earphone', 'airpod', 'earbuds', 'tws', 'bluetooth headset', 'handsfree'],
  },
  {
    hsnCode: '85182100',
    itemName: 'BLUETOOTH SPEAKERS',
    category: 'Consumer Electronics',
    gstRate: 18,
    description: 'Single or multiple loudspeakers, wireless Bluetooth speakers',
    keywords: ['speaker', 'bluetooth speaker', 'wireless speaker', 'soundbar'],
  },
  {
    hsnCode: '85044090',
    itemName: 'MOBILE CHARGER & POWER ADAPTER',
    category: 'Mobile Accessories',
    gstRate: 18,
    description: 'Mobile phone battery chargers, power adapters, USB adapters',
    keywords: ['charger', 'mobile charger', 'adapter', 'fast charger', 'power adapter', 'wall charger'],
  },
  {
    hsnCode: '85444299',
    itemName: 'USB CABLE & DATA CABLES',
    category: 'Mobile Accessories',
    gstRate: 18,
    description: 'Insulated electric conductors fitted with connectors, USB cables, Type C cables',
    keywords: ['data cable', 'usb cable', 'charging cable', 'type c cable', 'lightning cable'],
  },
  {
    hsnCode: '85076000',
    itemName: 'POWER BANK (LITHIUM-ION)',
    category: 'Mobile Accessories',
    gstRate: 18,
    description: 'Lithium-ion accumulators, power banks for mobile phones and gadgets',
    keywords: ['power bank', 'portable charger', 'external battery'],
  },
  {
    hsnCode: '91021200',
    itemName: 'SMART WATCH / DIGITAL WATCH',
    category: 'Consumer Electronics',
    gstRate: 18,
    description: 'Wrist watches with opto-electronic display, smartwatches, fitness bands',
    keywords: ['smart watch', 'smartwatch', 'fitness band', 'digital watch', 'wrist watch', 'watch'],
  },
  {
    hsnCode: '39269099',
    itemName: 'MOBILE COVER / CASE / TEMPERED GLASS',
    category: 'Mobile Accessories',
    gstRate: 18,
    description: 'Mobile phone back covers, TPU cases, tempered glass screen protectors',
    keywords: ['mobile cover', 'phone case', 'back cover', 'tempered glass', 'screen guard'],
  },

  // Lighting & Electricals
  {
    hsnCode: '94054090',
    itemName: 'LED LIGHTS & FIXTURES',
    category: 'Lighting & Electricals',
    gstRate: 18,
    description: 'LED lights, downlights, strip lights, decorative lights, lamps',
    keywords: ['led light', 'strip light', 'light bulb', 'lamp', 'ceiling light', 'flood light'],
  },
  {
    hsnCode: '85366910',
    itemName: 'ELECTRICAL PLUGS & SOCKETS',
    category: 'Lighting & Electricals',
    gstRate: 18,
    description: 'Plugs, sockets, extension boards, electrical switches',
    keywords: ['plug', 'socket', 'extension board', 'switch', 'power strip'],
  },

  // Footwear
  {
    hsnCode: '64029990',
    itemName: 'FOOTWEAR / SLIPPERS / SANDALS (RUBBER / PLASTIC)',
    category: 'Footwear',
    gstRate: 12,
    description: 'Footwear with outer soles and uppers of rubber or plastics, casual slippers, clogs, flip-flops',
    keywords: ['shoes', 'footwear', 'slippers', 'sandals', 'flip flops', 'clogs', 'crocs', 'sneakers'],
  },
  {
    hsnCode: '64039990',
    itemName: 'LEATHER FOOTWEAR',
    category: 'Footwear',
    gstRate: 12,
    description: 'Footwear with outer soles of rubber/plastics and uppers of leather',
    keywords: ['leather shoes', 'formal shoes', 'leather boots'],
  },

  // Garments & Textiles
  {
    hsnCode: '61091000',
    itemName: 'T-SHIRTS & VESTS (KNITTED COTTON)',
    category: 'Apparel & Garments',
    gstRate: 5,
    description: 'T-shirts, singlets and other vests, knitted or crocheted, of cotton',
    keywords: ['t-shirt', 'tshirt', 'cotton shirt', 'vest', 'top', 'round neck'],
  },
  {
    hsnCode: '62034200',
    itemName: 'JEANS & TROUSERS (MEN / BOYS)',
    category: 'Apparel & Garments',
    gstRate: 5,
    description: 'Men or boys trousers, bib and brace overalls, breeches and shorts, of cotton / denim',
    keywords: ['jeans', 'trousers', 'pants', 'cargo pants', 'shorts', 'denim'],
  },
  {
    hsnCode: '62044200',
    itemName: 'LADIES DRESSES & KURTIS',
    category: 'Apparel & Garments',
    gstRate: 5,
    description: 'Women or girls suits, ensembles, jackets, dresses, skirts, of cotton / synthetic',
    keywords: ['dress', 'kurti', 'gown', 'skirt', 'ladies suit', 'lehenga'],
  },
  {
    hsnCode: '63026000',
    itemName: 'TOWELS & BED LINEN',
    category: 'Home Textiles',
    gstRate: 12,
    description: 'Toilet linen and kitchen linen, of terry towelling or similar terry fabrics, bedsheets',
    keywords: ['towel', 'bath towel', 'bedsheet', 'blanket', 'pillow cover', 'linen'],
  },

  // Bags, Luggage & Accessories
  {
    hsnCode: '42022290',
    itemName: 'HANDBAGS & LADIES PURSES',
    category: 'Bags & Luggage',
    gstRate: 18,
    description: 'Handbags, with outer surface of plastic sheeting or textile materials',
    keywords: ['handbag', 'purse', 'ladies bag', 'clutch', 'tote bag', 'sling bag'],
  },
  {
    hsnCode: '42021290',
    itemName: 'BACKPACKS & SCHOOL BAGS',
    category: 'Bags & Luggage',
    gstRate: 18,
    description: 'Backpacks, rucksacks, school bags with outer surface of plastic sheeting or textiles',
    keywords: ['backpack', 'school bag', 'college bag', 'travel bag', 'rucksack'],
  },
  {
    hsnCode: '42021220',
    itemName: 'TROLLEY BAGS & SUITCASES',
    category: 'Bags & Luggage',
    gstRate: 18,
    description: 'Suitcases, executive cases, trolley luggage of plastics or vulcanized fibre',
    keywords: ['trolley bag', 'suitcase', 'luggage', 'travel trolley', 'cabin bag'],
  },

  // Cosmetics, Beauty & Personal Care
  {
    hsnCode: '33049990',
    itemName: 'COSMETICS & SKIN CARE PRODUCTS',
    category: 'Cosmetics & Beauty',
    gstRate: 18,
    description: 'Beauty or make-up preparations, creams, lotions, powders, skincare',
    keywords: ['cosmetics', 'makeup', 'face cream', 'lotion', 'lipstick', 'foundation', 'skincare'],
  },
  {
    hsnCode: '33051090',
    itemName: 'HAIR SHAMPOO & HAIR CARE',
    category: 'Cosmetics & Beauty',
    gstRate: 18,
    description: 'Shampoos, hair conditioners, hair oils, styling gels',
    keywords: ['shampoo', 'conditioner', 'hair oil', 'hair serum', 'hair care'],
  },
  {
    hsnCode: '96151100',
    itemName: 'HAIR CLIPS & HAIR ACCESSORIES',
    category: 'Cosmetics & Beauty',
    gstRate: 18,
    description: 'Combs, hair-slides, hairpins, curling pins of hard rubber or plastics',
    keywords: ['hair clip', 'rubber band', 'hair accessory', 'hair band', 'comb', 'hair pin'],
  },

  // Stationery & Office Supplies
  {
    hsnCode: '96081019',
    itemName: 'BALLPOINT PENS & GEL PENS',
    category: 'Stationery & Office',
    gstRate: 18,
    description: 'Ballpoint pens, felt tipped pens, marker pens, gel pens',
    keywords: ['pen', 'ball pen', 'gel pen', 'marker', 'highlighter', 'stationery'],
  },
  {
    hsnCode: '48201090',
    itemName: 'NOTEBOOKS & DIARIES',
    category: 'Stationery & Office',
    gstRate: 12,
    description: 'Registers, account books, notebooks, order books, receipt books, diaries',
    keywords: ['notebook', 'diary', 'register', 'notepad', 'sketchbook'],
  },
  {
    hsnCode: '82141010',
    itemName: 'PAPER CUTTERS & PENCIL SHARPENERS',
    category: 'Stationery & Office',
    gstRate: 18,
    description: 'Paper knives, letter openers, erasing knives, pencil sharpeners and blades',
    keywords: ['cutter', 'paper cutter', 'sharpener', 'scissors', 'ruler'],
  },

  // Hardware & Tools
  {
    hsnCode: '73181500',
    itemName: 'SCREWS, BOLTS & FASTENERS',
    category: 'Hardware & Tools',
    gstRate: 18,
    description: 'Threaded screws, bolts, nuts, coach screws, screw hooks of iron or steel',
    keywords: ['screws', 'bolts', 'nuts', 'fasteners', 'hardware'],
  },
  {
    hsnCode: '82055990',
    itemName: 'HAND TOOLS & HARDWARE',
    category: 'Hardware & Tools',
    gstRate: 18,
    description: 'Hand tools (including spanners, pliers, screwdrivers, hammers, drills)',
    keywords: ['screwdriver', 'hammer', 'pliers', 'wrench', 'tool kit', 'hand tool'],
  },

  // Auto Parts & Accessories
  {
    hsnCode: '87082900',
    itemName: 'AUTO ACCESSORIES & BODY PARTS',
    category: 'Automotive',
    gstRate: 28,
    description: 'Parts and accessories of the motor vehicles, body parts, car mats, sun shades',
    keywords: ['car accessories', 'car mat', 'auto parts', 'sun shade', 'car cover', 'seat cover'],
  },
  {
    hsnCode: '87141090',
    itemName: 'TWO WHEELER / MOTORCYCLE ACCESSORIES',
    category: 'Automotive',
    gstRate: 18,
    description: 'Parts and accessories of motorcycles and mopeds, helmet locks, bike covers',
    keywords: ['bike cover', 'helmet', 'bike accessories', 'two wheeler parts'],
  },

  // General Commercial Cargo
  {
    hsnCode: '9997',
    itemName: 'COMMERCIAL GOODS & MISCELLANEOUS CARGO',
    category: 'General Cargo',
    gstRate: 18,
    description: 'General commercial cargo, consolidation freight and miscellaneous goods',
    keywords: ['commercial goods', 'general goods', 'cargo', 'miscellaneous', 'goods', 'general cargo'],
  },
];

// Helper: Smart lookup by query or item name
export function findHsnSuggestions(query: string): HsnItem[] {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return MASTER_HSN_CATALOG.slice(0, 15);

  const words = cleanQ.split(/\s+/).filter(Boolean);

  const scored = MASTER_HSN_CATALOG.map((item) => {
    let score = 0;
    const nameLower = item.itemName.toLowerCase();
    const code = item.hsnCode.toLowerCase();
    const descLower = item.description.toLowerCase();
    const catLower = item.category.toLowerCase();

    // Exact HSN match
    if (code.startsWith(cleanQ)) score += 50;

    // Exact or prefix name match
    if (nameLower === cleanQ) score += 40;
    else if (nameLower.includes(cleanQ)) score += 25;

    // Check individual keyword matches
    item.keywords.forEach((kw) => {
      const kwLower = kw.toLowerCase();
      if (kwLower === cleanQ) score += 30;
      else if (kwLower.includes(cleanQ) || cleanQ.includes(kwLower)) score += 15;
    });

    // Check individual query words
    words.forEach((w) => {
      if (nameLower.includes(w)) score += 10;
      if (descLower.includes(w)) score += 5;
      if (catLower.includes(w)) score += 5;
      item.keywords.forEach((kw) => {
        if (kw.toLowerCase().includes(w)) score += 8;
      });
    });

    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item)
    .slice(0, 15);
}

// Helper: Fast single inference for an item name
export function inferHsnByItemName(itemName: string): HsnItem | null {
  const matches = findHsnSuggestions(itemName);
  return matches.length > 0 ? matches[0] : null;
}
