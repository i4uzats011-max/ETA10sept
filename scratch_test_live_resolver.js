const mongoose = require('mongoose');
const uri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function main() {
  await mongoose.connect(uri);

  const trackingDoc = await mongoose.connection.collection('receipttrackings').findOne({ token: 'trk_7ed4227ae304' });
  if (!trackingDoc) {
    console.error('Tracking doc not found');
    process.exit(1);
  }

  const receiptNos = Array.from(new Set((trackingDoc.receipts || []).map(r => (r.receiptNo || '').trim()).filter(Boolean)));
  console.log('Receipt numbers in link:', receiptNos);

  const liveShipments = await mongoose.connection.collection('shipments').find({ receipt: { $in: receiptNos } }).toArray();
  const liveWhReceipts = await mongoose.connection.collection('warehousereceipts').find({ receipt: { $in: receiptNos } }).toArray();
  
  const containerNames = Array.from(new Set(liveShipments.map(s => (s.container || '').trim()).filter(Boolean)));
  const liveContainers = await mongoose.connection.collection('containers').find({ container: { $in: containerNames } }).toArray();

  const containerMap = new Map();
  liveContainers.forEach(c => {
    if (c.container) containerMap.set(c.container.toLowerCase().trim(), c);
  });

  const shipmentMap = new Map();
  liveShipments.forEach(s => {
    const rKey = (s.receipt || '').toLowerCase().trim();
    if (!shipmentMap.has(rKey)) shipmentMap.set(rKey, []);
    shipmentMap.get(rKey).push(s);
  });

  const whMap = new Map();
  liveWhReceipts.forEach(w => {
    const rKey = (w.receipt || '').toLowerCase().trim();
    whMap.set(rKey, w);
  });

  const publicReceipts = [];

  for (const r of trackingDoc.receipts || []) {
    const rKey = (r.receiptNo || '').toLowerCase().trim();
    const rShipments = shipmentMap.get(rKey) || [];
    const whDoc = whMap.get(rKey);

    if (rShipments.length > 0) {
      for (const s of rShipments) {
        const cDoc = containerMap.get((s.container || '').toLowerCase().trim());
        const liveEta = cDoc?.destinationDate || cDoc?.eta || s.destinationDate || s.eta || r.eta || null;
        const isDelivered = Boolean(cDoc?.isDelivered || s.isDelivered || (cDoc?.status && /deliver|arrived/i.test(cDoc.status)) || (s.status && /deliver|arrived/i.test(s.status)) || (r.status && /deliver|arrived/i.test(r.status)));
        const liveStatus = isDelivered ? 'Delivered' : (cDoc?.status || s.status || r.status || 'In Transit');
        const markedDate = r.deliveryDate || r.markedDate || s.deliveryDate || cDoc?.deliveryDate || null;
        const effectiveDeliveryDate = isDelivered ? (markedDate || liveEta || null) : null;
        const liveCtn = String(s.quantity || r.ctn || '0');
        const liveWeight = String(s.weight || r.weight || '-');
        const liveCbm = String(s.volume || r.cbm || '0');
        const liveItemName = s.english || s.commodity || s.chinese || (whDoc && (whDoc.english || whDoc.commodity || whDoc.chinese)) || r.itemName || '-';
        const liveMarka = s.mainMarka || s.subMarka || s.party || whDoc?.mainMarka || whDoc?.subMarka || whDoc?.party || trackingDoc.name || r.marka || '-';
        const liveContainerNo = (s.container || r.containerNo || 'In Transit').replace(/\s*\([^)]*\)/g, '').trim();

        publicReceipts.push({
          marka: liveMarka,
          receiptNo: r.receiptNo || 'N/A',
          itemName: liveItemName,
          containerNo: liveContainerNo,
          cbm: liveCbm,
          weight: liveWeight,
          ctn: liveCtn,
          eta: liveEta,
          deliveryDate: effectiveDeliveryDate,
          status: isDelivered ? 'Delivered' : liveStatus
        });
      }

      if (whDoc) {
        const totalQty = typeof whDoc.quantity === 'number' ? whDoc.quantity : parseFloat(String(whDoc.quantity || '0')) || 0;
        const loadedQty = typeof whDoc.loadedQuantity === 'number' ? whDoc.loadedQuantity : parseFloat(String(whDoc.loadedQuantity || '0')) || 0;
        const remainingQty = typeof whDoc.remainingQuantity === 'number' ? whDoc.remainingQuantity : (totalQty - loadedQty);

        if (remainingQty > 0) {
          const whMarka = whDoc.mainMarka || whDoc.subMarka || whDoc.party || trackingDoc.name || r.marka || '-';
          const whItemName = (whDoc.items && whDoc.items[0]?.itemName) || whDoc.english || whDoc.commodity || whDoc.chinese || r.itemName || '-';
          publicReceipts.push({
            marka: whMarka,
            receiptNo: r.receiptNo || 'N/A',
            itemName: whItemName,
            containerNo: 'In Warehouse (Not Loaded)',
            cbm: String(whDoc.remainingVolume || whDoc.volume || '0'),
            weight: String(whDoc.remainingWeight || whDoc.weight || '-'),
            ctn: String(remainingQty),
            eta: null,
            deliveryDate: null,
            status: whDoc.status || 'Received in Warehouse'
          });
        }
      }
    } else if (whDoc) {
      const whMarka = whDoc.mainMarka || whDoc.subMarka || whDoc.party || trackingDoc.name || r.marka || '-';
      const whItemName = (whDoc.items && whDoc.items[0]?.itemName) || whDoc.english || whDoc.commodity || whDoc.chinese || r.itemName || '-';
      const whStatus = whDoc.status || 'Received in Warehouse';
      const isDelivered = /deliver/i.test(whStatus);
      publicReceipts.push({
        marka: whMarka,
        receiptNo: r.receiptNo || 'N/A',
        itemName: whItemName,
        containerNo: 'In Warehouse (Not Loaded)',
        cbm: String(whDoc.volume || r.cbm || '0'),
        weight: String(whDoc.weight || r.weight || '-'),
        ctn: String(whDoc.quantity || r.ctn || '0'),
        eta: null,
        deliveryDate: isDelivered ? (whDoc.deliveryDate || null) : null,
        status: whStatus
      });
    } else {
      publicReceipts.push({
        marka: r.marka || trackingDoc.name || '-',
        receiptNo: r.receiptNo || 'N/A',
        itemName: r.itemName || '-',
        containerNo: (r.containerNo || 'N/A').replace(/\s*\([^)]*\)/g, '').trim(),
        cbm: r.cbm || '0',
        weight: r.weight || '-',
        ctn: r.ctn || '0',
        eta: r.eta || null,
        deliveryDate: r.deliveryDate || null,
        status: r.status || 'In Transit'
      });
    }
  }

  console.log('LIVE RESOLVED RECEIPTS FOR trk_7ed4227ae304:');
  console.log(JSON.stringify(publicReceipts, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
