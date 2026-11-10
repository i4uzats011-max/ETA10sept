const mongoose = require('mongoose');
const fs = require('fs');

const envText = fs.readFileSync('C:/Users/USER/Desktop/New folder/anti/.env', 'utf8');
const match = envText.match(/MONGO_URI=(.*)/);
const uri = match ? match[1].trim() : '';

async function test() {
  await mongoose.connect(uri);

  const trackingDoc = await mongoose.connection.collection('receipttrackings').findOne({
    token: 'trk_f48bce04058e'
  });

  console.log('Tracking link name:', trackingDoc.name);
  const entry = trackingDoc.receipts.find(r => r.receiptNo === '261010020');
  console.log('Entry:', { receiptNo: entry.receiptNo, marka: entry.marka, ctn: entry.ctn, containerNo: entry.containerNo });

  const allWh = await mongoose.connection.collection('warehousereceipts').find({
    receipt: '261010020'
  }).toArray();

  const allShipments = await mongoose.connection.collection('shipments').find({
    receipt: '261010020'
  }).toArray();

  // Disambiguation algorithm:
  function pickMatchingWhDoc(entry, trackingName, whList) {
    if (whList.length === 1) return whList[0];

    const entryMarka = (entry.marka || '').toUpperCase().trim();
    const linkName = (trackingName || '').toUpperCase().trim();
    const entryCtn = parseFloat(entry.ctn || '0');
    const entryContainer = (entry.containerNo || '').toUpperCase().trim();

    // 1. By warehouse if present
    if (entry.warehouse) {
      const found = whList.find(w => (w.warehouse || '').toUpperCase().trim() === entry.warehouse.toUpperCase().trim());
      if (found) return found;
    }

    // 2. By warehouseReceiptId if present
    if (entry.warehouseReceiptId) {
      const found = whList.find(w => String(w._id) === String(entry.warehouseReceiptId));
      if (found) return found;
    }

    // 3. Score matching warehouse receipts
    let bestScore = -1;
    let bestWh = whList[0];

    for (const w of whList) {
      let score = 0;
      const wMainMarka = (w.mainMarka || '').toUpperCase().trim();
      const wSubMarka = (w.subMarka || '').toUpperCase().trim();
      const wParty = (w.party || '').toUpperCase().trim();
      const wQty = typeof w.quantity === 'number' ? w.quantity : parseFloat(w.quantity || '0');

      // Exact marka match
      if (entryMarka && (wMainMarka === entryMarka || wSubMarka === entryMarka)) {
        score += 10;
      } else if (entryMarka && (wMainMarka.includes(entryMarka) || entryMarka.includes(wMainMarka))) {
        score += 5;
      }

      // Link name match
      if (linkName && (wMainMarka === linkName || wParty === linkName || linkName.includes(wMainMarka) || wMainMarka.includes(linkName.replace(/\s+/g, '')))) {
        score += 8;
      }

      // Quantity / CTN match
      if (entryCtn > 0 && wQty === entryCtn) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestWh = w;
      }
    }

    return bestWh;
  }

  const selectedWh = pickMatchingWhDoc(entry, trackingDoc.name, allWh);
  console.log('Selected Warehouse Receipt:', {
    _id: selectedWh._id,
    warehouse: selectedWh.warehouse,
    mainMarka: selectedWh.mainMarka,
    quantity: selectedWh.quantity
  });

  // Filter shipments strictly for this warehouse
  const filteredShipments = allShipments.filter(s => {
    if (s.receiptId && String(s.receiptId) === String(selectedWh._id)) return true;
    if (s.warehouse && s.warehouse.toUpperCase().trim() === (selectedWh.warehouse || '').toUpperCase().trim()) return true;
    return false;
  });

  console.log('Filtered Shipments for entry:');
  filteredShipments.forEach(s => console.log({
    _id: s._id,
    container: s.container,
    quantity: s.quantity,
    warehouse: s.warehouse,
    mainMarka: s.mainMarka
  }));

  process.exit(0);
}
test();
