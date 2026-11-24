import { parseMetricNumber } from './metricUtils';

export type MetricStatus = 'MATCHED' | 'EXCESS' | 'SHORTAGE';

export type ExceptionCategory =
  | 'CARTON_CBM_MATCH_WEIGHT_MISMATCH'     // Cartons & CBM match, but Weight is higher/lower
  | 'CBM_WEIGHT_MATCH_CARTON_MISMATCH'     // CBM & Weight match, but Cartons are higher/lower
  | 'CARTON_WEIGHT_MATCH_CBM_MISMATCH'     // Cartons & Weight match, but CBM is higher/lower
  | 'CARTON_MATCH_CBM_WEIGHT_MISMATCH'     // Cartons match, but both CBM & Weight mismatch
  | 'CARTON_MATCH_CBM_MISMATCH'            // Cartons match, CBM mismatch, Weight matches
  | 'CARTON_MATCH_WEIGHT_MISMATCH'         // Cartons match, Weight mismatch, CBM matches
  | 'CBM_MATCH_CARTON_WEIGHT_MISMATCH'     // CBM matches, both Cartons & Weight mismatch
  | 'CBM_MATCH_CARTON_MISMATCH'            // CBM matches, Cartons mismatch, Weight matches
  | 'CBM_MATCH_WEIGHT_MISMATCH'            // CBM matches, Weight mismatch, Cartons match
  | 'WEIGHT_MATCH_CARTON_CBM_MISMATCH'     // Weight matches, both Cartons & CBM mismatch
  | 'EXCESS_LOADED_CARTONS'                // Cartons loaded > received (CBM & Weight match)
  | 'SHORTAGE_LOADED_CARTONS'              // Cartons loaded < received (CBM & Weight match)
  | 'ALL_METRICS_MISMATCH';                // All 3 (Carton, CBM, Weight) differ

export interface IExceptionMetricComparison {
  received: number;
  loaded: number;
  diff: number;          // loaded - received
  status: MetricStatus;  // MATCHED | EXCESS | SHORTAGE
  isMatched: boolean;
}

export interface IExceptionEvaluation {
  carton: IExceptionMetricComparison;
  cbm: IExceptionMetricComparison;
  weight: IExceptionMetricComparison;
  category: ExceptionCategory;
  categoryLabel: string;
  categoryGroup: string;
  isFullyMatched: boolean;
  hasMismatch: boolean;
  summary: string;
}

/**
 * Evaluates discrepancies between Loaded cargo and Received warehouse stock.
 * Formula: Diff = Loaded - Received
 * 
 * Rules:
 * - If cartonDiff === 0 && Math.abs(cbmDiff) <= 0.005 && Math.abs(weightDiff) <= 0.05 => FULLY MATCHED (Excluded from Exception Report)
 * - If any metric differs => Mismatch detected and classified into distinct exception categories.
 */
export function evaluateMetricsMismatch(
  receivedQty: number | string | undefined,
  loadedQty: number | string | undefined,
  receivedCbm: number | string | undefined,
  loadedCbm: number | string | undefined,
  receivedWeight: number | string | undefined,
  loadedWeight: number | string | undefined
): IExceptionEvaluation {
  // 1. Parse Carton / Quantity
  const rQty = Math.max(0, parseInt(String(receivedQty || 0), 10) || 0);
  const lQty = Math.max(0, parseInt(String(loadedQty || 0), 10) || 0);
  const cartonDiff = lQty - rQty;
  const isCartonMatched = cartonDiff === 0;
  const cartonStatus: MetricStatus = isCartonMatched ? 'MATCHED' : (cartonDiff > 0 ? 'EXCESS' : 'SHORTAGE');

  // 2. Parse CBM (Volume)
  const rCbm = Math.max(0, parseMetricNumber(receivedCbm));
  const lCbm = Math.max(0, parseMetricNumber(loadedCbm));
  const rawCbmDiff = lCbm - rCbm;
  const cbmDiff = Number(rawCbmDiff.toFixed(3));
  const isCbmMatched = Math.abs(cbmDiff) <= 0.005;
  const cbmStatus: MetricStatus = isCbmMatched ? 'MATCHED' : (cbmDiff > 0 ? 'EXCESS' : 'SHORTAGE');

  // 3. Parse Gross Weight (KG)
  const rWeight = Math.max(0, parseMetricNumber(receivedWeight));
  const lWeight = Math.max(0, parseMetricNumber(loadedWeight));
  const rawWeightDiff = lWeight - rWeight;
  const weightDiff = Number(rawWeightDiff.toFixed(2));
  const isWeightMatched = Math.abs(weightDiff) <= 0.05;
  const weightStatus: MetricStatus = isWeightMatched ? 'MATCHED' : (weightDiff > 0 ? 'EXCESS' : 'SHORTAGE');

  // Full Match Check (Only non-matched will be shown in Exception Report)
  const isFullyMatched = isCartonMatched && isCbmMatched && isWeightMatched;
  const hasMismatch = !isFullyMatched;

  // Category Classification
  let category: ExceptionCategory = 'ALL_METRICS_MISMATCH';
  let categoryLabel = 'Multi-Metric Mismatch';
  let categoryGroup = 'Multi-Metric Mismatch';
  let summary = '';

  if (isFullyMatched) {
    category = 'EXCESS_LOADED_CARTONS'; // Fallback
    categoryLabel = 'Fully Matched (पूर्णतया मेल)';
    categoryGroup = 'Matched';
    summary = 'All Carton, CBM and Weight parameters match exactly.';
  } else if (isCartonMatched && isCbmMatched && !isWeightMatched) {
    // Cartons & CBM match, but Weight is higher/lower
    category = 'CARTON_CBM_MATCH_WEIGHT_MISMATCH';
    categoryGroup = 'Carton & CBM Matched, Weight Mismatch';
    const sign = weightDiff > 0 ? `+${weightDiff.toFixed(1)}` : `${weightDiff.toFixed(1)}`;
    categoryLabel = `Carton & CBM Matched | Weight ${sign} kg (${weightStatus === 'EXCESS' ? 'ज्यादा वेट' : 'कम वेट'})`;
    summary = `${rQty} Cartons & ${rCbm.toFixed(2)} CBM match, but Weight differs by ${sign} kg.`;
  } else if (!isCartonMatched && isCbmMatched && isWeightMatched) {
    // CBM & Weight match, but Cartons are higher/lower
    category = 'CBM_WEIGHT_MATCH_CARTON_MISMATCH';
    categoryGroup = 'CBM & Weight Matched, Carton Mismatch';
    const sign = cartonDiff > 0 ? `+${cartonDiff}` : `${cartonDiff}`;
    categoryLabel = `CBM & Weight Matched | Cartons ${sign} CTN (${cartonStatus === 'EXCESS' ? 'ज्यादा कार्टन' : 'कम कार्टन'})`;
    summary = `${rCbm.toFixed(2)} CBM & ${rWeight.toFixed(1)} kg match, but Cartons differ by ${sign} CTN.`;
  } else if (isCartonMatched && !isCbmMatched && isWeightMatched) {
    // Cartons & Weight match, but CBM is higher/lower
    category = 'CARTON_WEIGHT_MATCH_CBM_MISMATCH';
    categoryGroup = 'Carton & Weight Matched, CBM Mismatch';
    const sign = cbmDiff > 0 ? `+${cbmDiff.toFixed(2)}` : `${cbmDiff.toFixed(2)}`;
    categoryLabel = `Carton & Weight Matched | CBM ${sign} m³ (${cbmStatus === 'EXCESS' ? 'ज्यादा CBM' : 'कम CBM'})`;
    summary = `${rQty} Cartons & ${rWeight.toFixed(1)} kg match, but CBM differs by ${sign} m³.`;
  } else if (isCartonMatched && !isCbmMatched && !isWeightMatched) {
    // Cartons match, but both CBM and Weight mismatch
    category = 'CARTON_MATCH_CBM_WEIGHT_MISMATCH';
    categoryGroup = 'Carton Matched, CBM/Weight Mismatch';
    categoryLabel = 'Carton Matched | CBM & Weight Mismatch (कार्टन पूरे, CBM और वेट मिसमैच)';
    summary = `${rQty} Cartons fully matched, but CBM (${cbmDiff > 0 ? '+' : ''}${cbmDiff.toFixed(2)}) and Weight (${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} kg) mismatched.`;
  } else if (isCbmMatched && !isCartonMatched && !isWeightMatched) {
    // CBM matches, but both Cartons and Weight mismatch
    category = 'CBM_MATCH_CARTON_WEIGHT_MISMATCH';
    categoryGroup = 'CBM Matched, Carton/Weight Mismatch';
    categoryLabel = 'CBM Matched | Carton & Weight Mismatch (CBM पूरे, कार्टन और वेट मिसमैच)';
    summary = `${rCbm.toFixed(2)} CBM fully matched, but Cartons (${cartonDiff > 0 ? '+' : ''}${cartonDiff}) and Weight (${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} kg) mismatched.`;
  } else if (isWeightMatched && !isCartonMatched && !isCbmMatched) {
    // Weight matches, but both Cartons and CBM mismatch
    category = 'WEIGHT_MATCH_CARTON_CBM_MISMATCH';
    categoryGroup = 'Weight Matched, Carton/CBM Mismatch';
    categoryLabel = 'Weight Matched | Carton & CBM Mismatch (वेट पूरा, कार्टन और CBM मिसमैच)';
    summary = `${rWeight.toFixed(1)} kg fully matched, but Cartons (${cartonDiff > 0 ? '+' : ''}${cartonDiff}) and CBM (${cbmDiff > 0 ? '+' : ''}${cbmDiff.toFixed(2)}) mismatched.`;
  } else {
    // All 3 metrics mismatch
    category = 'ALL_METRICS_MISMATCH';
    categoryGroup = 'Multi-Metric Mismatch';
    categoryLabel = 'Multi-Metric Discrepancy (कार्टन, CBM और वेट तीनों मिसमैच)';
    summary = `Cartons (${cartonDiff > 0 ? '+' : ''}${cartonDiff}), CBM (${cbmDiff > 0 ? '+' : ''}${cbmDiff.toFixed(2)}), and Weight (${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} kg) all differ.`;
  }

  return {
    carton: {
      received: rQty,
      loaded: lQty,
      diff: cartonDiff,
      status: cartonStatus,
      isMatched: isCartonMatched,
    },
    cbm: {
      received: rCbm,
      loaded: lCbm,
      diff: cbmDiff,
      status: cbmStatus,
      isMatched: isCbmMatched,
    },
    weight: {
      received: rWeight,
      loaded: lWeight,
      diff: weightDiff,
      status: weightStatus,
      isMatched: isWeightMatched,
    },
    category,
    categoryLabel,
    categoryGroup,
    isFullyMatched,
    hasMismatch,
    summary,
  };
}
