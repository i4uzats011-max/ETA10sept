const fs = require('fs');

const filePath = 'C:/Users/USER/Desktop/New folder/anti/lib/liveTrackingResolver.ts';
let code = fs.readFileSync(filePath, 'utf8');

// Replace the Map building and for loop header
const targetBlock = `  const shipmentMap = new Map<string, any[]>();
  liveShipments.forEach((s: any) => {
    const rKey = (s.receipt || '').toLowerCase().trim();
    if (!shipmentMap.has(rKey)) shipmentMap.set(rKey, []);
    shipmentMap.get(rKey)!.push(s);
  });

  const whMap = new Map<string, any>();
  liveWhReceipts.forEach((w: any) => {
    const rKey = (w.receipt || '').toLowerCase().trim();
    whMap.set(rKey, w);
  });

  const resolvedList: ILivePublicReceipt[] = [];

  for (const entry of receiptEntries) {
    const rNo = (entry.receiptNo || '').trim();
    const rKey = rNo.toLowerCase();
    const rShipments = shipmentMap.get(rKey) || [];
    const whDoc = whMap.get(rKey);

    // Common Fallback / Master Marka
    const baseMarka =
      whDoc?.mainMarka ||
      whDoc?.subMarka ||
      whDoc?.party ||
      entry.marka ||
      defaultMarka ||
      '-';

    // =========================================================================
    // CASE A: Receipt has one or more Shipments loaded into container(s)
    // =========================================================================
    if (rShipments.length > 0) {
      const isSplitAcrossContainers = rShipments.length > 1;`;

const replacementBlock = `  const shipmentsByReceipt = new Map<string, any[]>();
  liveShipments.forEach((s: any) => {
    const rKey = (s.receipt || '').toLowerCase().trim();
    if (!shipmentsByReceipt.has(rKey)) shipmentsByReceipt.set(rKey, []);
    shipmentsByReceipt.get(rKey)!.push(s);
  });

  const whByReceipt = new Map<string, any[]>();
  liveWhReceipts.forEach((w: any) => {
    const rKey = (w.receipt || '').toLowerCase().trim();
    if (!whByReceipt.has(rKey)) whByReceipt.set(rKey, []);
    whByReceipt.get(rKey)!.push(w);
  });

  const resolvedList: ILivePublicReceipt[] = [];

  for (const entry of receiptEntries) {
    const rNo = (entry.receiptNo || '').trim();
    const rKey = rNo.toLowerCase();
    const whList = whByReceipt.get(rKey) || [];
    const allShipmentsForReceipt = shipmentsByReceipt.get(rKey) || [];

    // Target the specific warehouse receipt matching this tracking entry
    const whDoc = pickTargetWarehouseReceipt(entry, defaultMarka, whList, allShipmentsForReceipt);
    const targetWarehouse = whDoc?.warehouse || entry.warehouse || '';

    // Filter shipments strictly for this warehouse receipt so different warehouses/parties never mix
    let rShipments: any[] = [];
    if (whDoc) {
      rShipments = allShipmentsForReceipt.filter((s: any) => {
        if (s.receiptId && String(s.receiptId) === String(whDoc._id)) return true;
        if (s.warehouse && whDoc.warehouse && s.warehouse.toUpperCase().trim() === whDoc.warehouse.toUpperCase().trim()) return true;
        if (!s.warehouse && s.mainMarka && whDoc.mainMarka && s.mainMarka.toUpperCase().trim() === whDoc.mainMarka.toUpperCase().trim()) return true;
        return false;
      });
    } else if (targetWarehouse) {
      rShipments = allShipmentsForReceipt.filter((s: any) =>
        (s.warehouse || '').toUpperCase().trim() === targetWarehouse.toUpperCase().trim()
      );
    } else {
      rShipments = allShipmentsForReceipt;
    }

    // Common Fallback / Master Marka (entry.marka takes precedence)
    const baseMarka =
      entry.marka ||
      whDoc?.mainMarka ||
      whDoc?.subMarka ||
      whDoc?.party ||
      defaultMarka ||
      '-';

    // =========================================================================
    // CASE A: Receipt has one or more Shipments loaded into container(s)
    // =========================================================================
    if (rShipments.length > 0) {
      const isSplitAcrossContainers = rShipments.length > 1;`;

code = code.replace(targetBlock.replace(/\r?\n/g, '\r\n'), replacementBlock.replace(/\r?\n/g, '\r\n'));
if (!code.includes('shipmentsByReceipt')) {
  // Try with LF
  code = code.replace(targetBlock.replace(/\r\n/g, '\n'), replacementBlock.replace(/\r\n/g, '\n'));
}

// Add warehouse property to resolvedList pushes
code = code.replace(/receiptNo:\s*rNo,\s*itemName:/g, `receiptNo: rNo,\n              warehouse: whDoc?.warehouse || targetWarehouse || undefined,\n              itemName:`);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Updated lib/liveTrackingResolver.ts successfully');
