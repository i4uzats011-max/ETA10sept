const mongoose = require('mongoose');

function parseMetricNumber(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).replace(/,/g, '').trim();
  const match = str.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  return isNaN(num) ? 0 : num;
}

function evaluateMetricsMismatch(rQty, lQty, rCbm, lCbm, rWeight, lWeight) {
  const cartonDiff = lQty - rQty;
  const isCartonMatched = cartonDiff === 0;

  const rawCbmDiff = lCbm - rCbm;
  const cbmDiff = Number(rawCbmDiff.toFixed(3));
  const isCbmMatched = Math.abs(cbmDiff) <= 0.005;

  const rawWeightDiff = lWeight - rWeight;
  const weightDiff = Number(rawWeightDiff.toFixed(2));
  const isWeightMatched = Math.abs(weightDiff) <= 0.05;

  const isFullyMatched = isCartonMatched && isCbmMatched && isWeightMatched;
  const hasMismatch = !isFullyMatched;

  let categoryGroup = 'Multi-Metric Mismatch';
  let categoryLabel = 'Multi-Metric Mismatch';

  if (isFullyMatched) {
    categoryGroup = 'Matched';
    categoryLabel = 'Fully Matched';
  } else if (isCartonMatched && isCbmMatched && !isWeightMatched) {
    categoryGroup = 'Carton & CBM Matched, Weight Mismatch';
    categoryLabel = `Carton & CBM Matched | Weight ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} kg`;
  } else if (!isCartonMatched && isCbmMatched && isWeightMatched) {
    categoryGroup = 'CBM & Weight Matched, Carton Mismatch';
    categoryLabel = `CBM & Weight Matched | Cartons ${cartonDiff > 0 ? '+' : ''}${cartonDiff} CTN`;
  } else if (isCartonMatched && !isCbmMatched && isWeightMatched) {
    categoryGroup = 'Carton & Weight Matched, CBM Mismatch';
    categoryLabel = `Carton & Weight Matched | CBM ${cbmDiff > 0 ? '+' : ''}${cbmDiff.toFixed(2)} m³`;
  } else if (isCartonMatched && !isCbmMatched && !isWeightMatched) {
    categoryGroup = 'Carton Matched, CBM/Weight Mismatch';
    categoryLabel = 'Carton Matched | CBM & Weight Mismatch';
  } else if (isCbmMatched && !isCartonMatched && !isWeightMatched) {
    categoryGroup = 'CBM Matched, Carton/Weight Mismatch';
    categoryLabel = 'CBM Matched | Carton & Weight Mismatch';
  } else if (isWeightMatched && !isCartonMatched && !isCbmMatched) {
    categoryGroup = 'Weight Matched, Carton/CBM Mismatch';
    categoryLabel = 'Weight Matched | Carton & CBM Mismatch';
  }

  return {
    isFullyMatched,
    hasMismatch,
    cartonDiff,
    cbmDiff,
    weightDiff,
    categoryGroup,
    categoryLabel
  };
}

async function testExceptionReport() {
  await mongoose.connect('mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0');
  const Container = mongoose.connection.collection('containers');
  const Shipment = mongoose.connection.collection('shipments');
  const WarehouseReceipt = mongoose.connection.collection('warehousereceipts');

  console.log('--- 1. Fetching Containers & Shipments ---');
  const containers = await Container.find({}).toArray();
  const shipments = await Shipment.find({}).toArray();
  const whReceipts = await WarehouseReceipt.find({}).toArray();

  console.log('Containers count:', containers.length);
  console.log('Shipments count:', shipments.length);
  console.log('WarehouseReceipts count:', whReceipts.length);

  const whMap = new Map();
  whReceipts.forEach(w => {
    if (w.receipt) whMap.set(String(w.receipt).toUpperCase().trim(), w);
  });

  let fullyMatchedCount = 0;
  let mismatchCount = 0;
  const categoriesFound = {};
  const sampleMismatches = [];

  for (const s of shipments) {
    if (!s.receipt) continue;
    const wh = whMap.get(String(s.receipt).toUpperCase().trim());
    if (!wh) continue;

    const rQty = parseInt(wh.quantity || 0, 10);
    const lQty = parseInt(s.quantity || 0, 10);
    const rCbm = parseMetricNumber(wh.volume);
    const lCbm = parseMetricNumber(s.volume);
    const rWeight = parseMetricNumber(wh.weight);
    const lWeight = parseMetricNumber(s.weight);

    const res = evaluateMetricsMismatch(rQty, lQty, rCbm, lCbm, rWeight, lWeight);
    if (res.isFullyMatched) {
      fullyMatchedCount++;
    } else {
      mismatchCount++;
      categoriesFound[res.categoryGroup] = (categoriesFound[res.categoryGroup] || 0) + 1;
      if (sampleMismatches.length < 5) {
        sampleMismatches.push({
          receipt: s.receipt,
          container: s.container,
          rQty, lQty, diffQty: res.cartonDiff,
          rCbm, lCbm, diffCbm: res.cbmDiff,
          rWeight, lWeight, diffWeight: res.weightDiff,
          categoryLabel: res.categoryLabel,
          categoryGroup: res.categoryGroup
        });
      }
    }
  }

  console.log('\n--- HISTORICAL DATA SCAN RESULTS ---');
  console.log('Fully Matched Records (Excluded from Exception Report):', fullyMatchedCount);
  console.log('Mismatched Records (Detected and Included in Exception Report):', mismatchCount);
  console.log('Categories Distribution across Historical Data:');
  console.table(categoriesFound);
  console.log('\nSample Mismatches from Historical Data:\n', JSON.stringify(sampleMismatches, null, 2));

  await mongoose.disconnect();
}

testExceptionReport().catch(console.error);
