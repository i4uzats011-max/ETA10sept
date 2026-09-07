/**
 * Commodity English Translation Helper
 * Translates Chinese commodity names and terms strictly into clean English.
 */

const CHINESE_TO_ENGLISH_DICTIONARY: Record<string, string> = {
  '电子配件': 'Electronic Components & Accessories',
  '电子产品': 'Electronic Products & Gadgets',
  '电子': 'Electronics',
  '数码产品': 'Digital Electronics & Accessories',

  '服装': 'Garments & Apparel',
  '衣服': 'Clothing & Garments',
  '面料': 'Textile Fabrics',
  '纺织品': 'Textiles & Goods',
  '女装': 'Womens Apparel',
  '男装': 'Mens Apparel',

  '机械': 'Machinery & Industrial Equipment',
  '机械设备': 'Machinery & Heavy Equipment',
  '零部件': 'Mechanical Spare Parts',
  '配件': 'Spare Parts & Accessories',

  '五金': 'Hardware & Metal Tools',
  '五金工具': 'Hardware Hand Tools',
  '工具': 'Tools & Equipment',

  '日用百货': 'Daily General Merchandise',
  '百货': 'General Commodities',
  '杂货': 'Miscellaneous Goods',

  '塑料制品': 'Plastic Products & Goods',
  '塑料': 'Plastics & Synthetics',

  '灯具': 'Lighting Fixtures & LED',
  '照明': 'Lighting & Illumination',

  '鞋帽': 'Footwear & Headwear',
  '鞋子': 'Footwear & Shoes',

  '玩具': 'Toys & Educational Crafts',
  '箱包': 'Bags, Luggage & Cases',
  '包袋': 'Bags & Pouches',

  '化工': 'Chemical Products',
  '化工品': 'Chemical Supplies',

  '家具': 'Furniture & Home Décor',
  '家居': 'Home Goods & Décor',

  '普通货物': 'General Cargo',
  '中文货物': 'General Merchandise',
  '货物商品': 'General Commercial Commodities',
};

const KEYWORD_MAP: [RegExp, string][] = [
  [/\bled\b/i, 'LED Lighting & Fixtures'],
  [/\blight(s|ing)?\b/i, 'Lighting Fixtures & Accessories'],
  [/\b(bulb|lamp)s?\b/i, 'LED Bulbs & Lighting'],
  [/\belectronic(s)?\b/i, 'Electronic Equipment & Components'],
  [/\b(mobile|phone|charger|cable)s?\b/i, 'Mobile & Electronics Accessories'],
  [/\b(fabric|cloth|garment|apparel)s?\b/i, 'Textile Fabrics & Garments'],
  [/\b(tool|hardware)s?\b/i, 'Hardware Tools & Equipment'],
  [/\b(plastic|pvc)s?\b/i, 'Plastic Products & Goods'],
  [/\b(shoe|shoes|footwear)\b/i, 'Footwear & Shoes'],
  [/\b(bag|bags|luggage)\b/i, 'Bags & Luggage'],
  [/\b(toy|toys)\b/i, 'Toys & Educational Crafts'],
];

/**
 * Always translates any input string (Chinese or mixed) into clean English ONLY.
 */
export function translateToEnglish(input?: string): string {
  if (!input || input.trim() === '' || input.trim() === 'N/A') {
    return 'General Merchandise';
  }

  // Strip leading/trailing question marks, colons, slashes, or artifacts
  const clean = input
    .trim()
    .replace(/^[\s?？\-_:：/／,，.]+|[\s?？\-_:：/／,，.]+$/g, '')
    .trim();

  if (!clean) {
    return 'General Merchandise';
  }

  // 1. Direct dictionary match
  if (CHINESE_TO_ENGLISH_DICTIONARY[clean]) {
    return CHINESE_TO_ENGLISH_DICTIONARY[clean];
  }

  // 2. Partial dictionary match for known Chinese keywords
  for (const [cn, en] of Object.entries(CHINESE_TO_ENGLISH_DICTIONARY)) {
    if (clean.includes(cn)) {
      return en;
    }
  }

  // 3. Keyword patterns (e.g. ??LED? -> LED Lighting & Fixtures)
  for (const [regex, replacement] of KEYWORD_MAP) {
    if (regex.test(clean)) {
      return replacement;
    }
  }

  // 4. Remove Chinese characters and brackets if mixed e.g. "电子配件 (Electronic Components)" -> "Electronic Components"
  const strippedOfChinese = clean
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/[\(\)（）]/g, '')
    .replace(/[\?？]/g, '')
    .trim();

  if (strippedOfChinese.length > 1) {
    // Capitalize first letter cleanly
    return strippedOfChinese.charAt(0).toUpperCase() + strippedOfChinese.slice(1);
  }

  return 'General Merchandise';
}
