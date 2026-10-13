/**
 * Logistics metric calculation utilities for cartons (CTN), volume (CBM), and gross weight (KG).
 * Handles unit parsing, dynamic loaded subtraction, and remaining balance calculations per receipt.
 */

export function parseMetricNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).replace(/,/g, '').trim();
  const match = str.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  return isNaN(num) ? 0 : num;
}

export function formatMetricNumber(num: number, decimals: number = 3): string {
  if (isNaN(num) || num <= 0) return '0';
  if (Math.round(num) === num) return num.toString();
  return Number(num.toFixed(decimals)).toString();
}

export interface ILoadedItemSummary {
  name: string;
  ctn: number;
  cbm: number;
  weight: number;
  container?: string;
  rate?: number | string;
  cost?: number | string;
}

export interface IReceiptBalance {
  receipt: string;
  originalName: string;
  originalQty: number;
  originalCbm: number;
  originalWeight: number;
  loadedQty: number;
  loadedCbm: number;
  loadedWeight: number;
  balanceName: string;
  balanceQty: number;
  balanceCbm: number;
  balanceWeight: number;
  loadedItems: ILoadedItemSummary[];
  isFullyLoaded: boolean;
  isPartiallyLoaded: boolean;
}

/**
 * Calculates loaded totals and remaining warehouse balance for a receipt.
 * Given original warehouse stock: Name "a", 3 CTN, 3 CBM, 3 KG.
 * And loaded shipments: Name "b" (1 CTN, 1 CBM, 1 KG), Name "c" (1 CTN, 1 CBM, 1 KG).
 * Yields remaining balance: Name "a", 1 CTN, 1 CBM, 1 KG.
 */
export function calculateReceiptBalance(
  receipt: {
    receipt: string;
    commodity?: string;
    english?: string;
    chinese?: string;
    quantity?: number | string;
    volume?: number | string;
    weight?: number | string;
  },
  loadedShipments: Array<{
    container?: string;
    quantity?: number | string;
    volume?: number | string;
    weight?: number | string;
    commodity?: string;
    english?: string;
    goodsItems?: Array<{
      name?: string;
      ctn?: number | string;
      cbm?: number | string;
      weight?: number | string;
      rate?: number | string;
      cost?: number | string;
    }>;
  }>
): IReceiptBalance {
  const originalName = (receipt.english || receipt.commodity || 'General Goods').trim();
  const originalQty = Math.max(0, parseInt(String(receipt.quantity || 0), 10) || 0);
  const originalCbm = Math.max(0, parseMetricNumber(receipt.volume));
  const originalWeight = Math.max(0, parseMetricNumber(receipt.weight));

  let loadedQty = 0;
  let loadedCbm = 0;
  let loadedWeight = 0;
  const loadedItems: ILoadedItemSummary[] = [];

  for (const s of loadedShipments || []) {
    const sContainer = s.container || '';

    // If shipment has explicit goodsItems breakdown
    if (s.goodsItems && Array.isArray(s.goodsItems) && s.goodsItems.length > 0) {
      for (const gi of s.goodsItems) {
        const giName = (gi.name || s.english || s.commodity || originalName).trim();
        const giCtn = Math.max(0, parseInt(String(gi.ctn || 0), 10) || 0);
        const giCbm = Math.max(0, parseMetricNumber(gi.cbm));
        const giWeight = Math.max(0, parseMetricNumber(gi.weight));

        loadedQty += giCtn;
        loadedCbm += giCbm;
        loadedWeight += giWeight;

        loadedItems.push({
          name: giName,
          ctn: giCtn,
          cbm: giCbm,
          weight: giWeight,
          container: sContainer,
          rate: gi.rate,
          cost: gi.cost,
        });
      }
    } else {
      // Top-level shipment values
      const sName = (s.english || s.commodity || originalName).trim();
      const sCtn = Math.max(0, parseInt(String(s.quantity || 0), 10) || 0);
      const sCbm = Math.max(0, parseMetricNumber(s.volume));
      const sWeight = Math.max(0, parseMetricNumber(s.weight));

      loadedQty += sCtn;
      loadedCbm += sCbm;
      loadedWeight += sWeight;

      loadedItems.push({
        name: sName,
        ctn: sCtn,
        cbm: sCbm,
        weight: sWeight,
        container: sContainer,
      });
    }
  }

  const balanceQty = Math.max(0, originalQty - loadedQty);
  const balanceCbm = Math.max(0, Number((originalCbm - loadedCbm).toFixed(3)));
  const balanceWeight = Math.max(0, Number((originalWeight - loadedWeight).toFixed(3)));

  const isFullyLoaded = originalQty > 0 && balanceQty === 0;
  const isPartiallyLoaded = loadedQty > 0 && balanceQty > 0;

  return {
    receipt: receipt.receipt,
    originalName,
    originalQty,
    originalCbm,
    originalWeight,
    loadedQty,
    loadedCbm: Number(loadedCbm.toFixed(3)),
    loadedWeight: Number(loadedWeight.toFixed(3)),
    balanceName: originalName, // Internal rule: Retains original receipt commodity name
    balanceQty,
    balanceCbm,
    balanceWeight,
    loadedItems,
    isFullyLoaded,
    isPartiallyLoaded,
  };
}
