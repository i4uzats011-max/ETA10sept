const fs = require('fs');

const filePath = 'C:/Users/USER/Desktop/New folder/anti/app/api/track/receipt-link/[token]/add-receipt/route.ts';
let code = fs.readFileSync(filePath, 'utf8');

const targetSection = `    // 3. Search database for this receipt (WarehouseReceipt has total received CTN in warehouse)
    const receiptRegex = new RegExp(\`^\${inputReceiptNo.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}$\`, 'i');

    const whItem: any = await WarehouseReceipt.findOne({ receipt: receiptRegex }).lean();
    const shipments: any[] = await Shipment.find({ receipt: receiptRegex }).lean();

    let matchedRecord: any = null;
    let totalWarehouseCtnNum: number | null = null;
    let recordSource = '';

    if (whItem) {
      matchedRecord = whItem;
      recordSource = 'warehouse';
      totalWarehouseCtnNum = normalizeCarton(whItem.quantity);
    }

    if (shipments.length > 0) {
      if (!matchedRecord) {
        matchedRecord = shipments[0];
        recordSource = 'shipment';
      }
      // Check original total quantity or sum across split shipments
      const origQty = normalizeCarton(shipments[0]?.originalTotalQuantity);
      if (origQty !== null && origQty > 0) {
        if (totalWarehouseCtnNum === null) totalWarehouseCtnNum = origQty;
      } else if (totalWarehouseCtnNum === null) {
        const sumQty = shipments.reduce((acc, s) => acc + (normalizeCarton(s.quantity) || 0), 0);
        if (sumQty > 0) totalWarehouseCtnNum = sumQty;
      }
    }

    // Fallback: check existing tracking documents in ReceiptTracking
    if (!matchedRecord) {
      const existingDoc: any = await ReceiptTracking.findOne({ 'receipts.receiptNo': receiptRegex }).lean();
      if (existingDoc && Array.isArray(existingDoc.receipts)) {
        const found = existingDoc.receipts.find(
          (r: any) => r.receiptNo && r.receiptNo.toLowerCase() === inputReceiptNo.toLowerCase()
        );
        if (found) {
          matchedRecord = found;
          recordSource = 'receipt_tracking';
          totalWarehouseCtnNum = normalizeCarton(found.ctn);
        }
      }
    }

    if (!matchedRecord || totalWarehouseCtnNum === null) {
      return NextResponse.json({
        success: false,
        message: \`Receipt #\${inputReceiptNo} was not found in shipment records. Please verify the receipt number on your warehouse slip.\`
      }, { status: 404 });
    }

    // 4. Verify CTN matches TOTAL CTN RECEIVED IN WAREHOUSE
    if (totalWarehouseCtnNum !== inputCtnNum) {
      return NextResponse.json({
        success: false,
        message: \`Verification failed: Carton count (\${inputCtn} CTN) does not match total packages received in warehouse for Receipt #\${inputReceiptNo}. Please enter the total CTN received as per your warehouse slip.\`
      }, { status: 400 });
    }

    // 5. Verification passed: both receipt and total CTN are verified
    const newEntry: IReceiptEntry = {
      id: 'rec_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      receiptNo: matchedRecord.receipt || matchedRecord.receiptNo || inputReceiptNo,
      marka: String(matchedRecord.mainMarka || matchedRecord.subMarka || matchedRecord.marka || trackingDoc.name || '').trim(),
      itemName: String(matchedRecord.english || matchedRecord.commodity || matchedRecord.chinese || matchedRecord.itemName || (matchedRecord.items && matchedRecord.items[0]?.itemName) || '').trim(),
      cbm: String(matchedRecord.volume || matchedRecord.cbm || '').trim(),
      ctn: String(totalWarehouseCtnNum),
      weight: String(matchedRecord.weight || '').trim(),
      containerNo: String(matchedRecord.container || matchedRecord.containerNo || 'In Warehouse (Not Loaded)').trim(),
      actualContainerNo: '',
      eta: String(matchedRecord.destinationDate || matchedRecord.eta || '').trim(),
      status: String(matchedRecord.status || (recordSource === 'warehouse' ? 'Received in Warehouse' : 'In Transit')).trim(),
      adminNotes: 'Self-added by customer via tracking link with verified warehouse total CTN',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    trackingDoc.receipts.push(newEntry);
    trackingDoc.updatedAt = new Date();
    await trackingDoc.save();

    return NextResponse.json({
      success: true,
      message: \`✓ Receipt #\${newEntry.receiptNo} (Total \${newEntry.ctn} CTN in Warehouse) verified & linked successfully!\`,`;

const replacementSection = `    // 3. Search database for this receipt across China warehouses
    const receiptRegex = new RegExp(\`^\${inputReceiptNo.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}$\`, 'i');

    const matchingWhItems: any[] = await WarehouseReceipt.find({ receipt: receiptRegex }).lean();
    const allShipments: any[] = await Shipment.find({ receipt: receiptRegex }).lean();

    let matchedWh: any = null;
    let matchedShipment: any = null;
    let targetWarehouse = '';
    let targetWhId = '';
    let totalWarehouseCtnNum: number | null = null;
    let recordSource = '';

    // If receipt exists in warehouse receipts, find the specific warehouse matching this carton count
    if (matchingWhItems.length > 0) {
      matchedWh = matchingWhItems.find((w: any) => normalizeCarton(w.quantity) === inputCtnNum);
      if (!matchedWh && matchingWhItems.length === 1) {
        matchedWh = matchingWhItems[0];
      }

      if (matchedWh) {
        totalWarehouseCtnNum = normalizeCarton(matchedWh.quantity);
        targetWarehouse = matchedWh.warehouse || '';
        targetWhId = String(matchedWh._id);
        recordSource = 'warehouse';

        // Find corresponding shipment for this specific warehouse if loaded
        matchedShipment = allShipments.find((s: any) =>
          (s.receiptId && String(s.receiptId) === targetWhId) ||
          (s.warehouse && targetWarehouse && s.warehouse.toUpperCase().trim() === targetWarehouse.toUpperCase().trim())
        );
      }
    }

    // If not found in warehouse receipts, check shipments grouped by warehouse
    if (!matchedWh && allShipments.length > 0) {
      const shipmentsByWh = new Map<string, any[]>();
      allShipments.forEach((s: any) => {
        const whKey = (s.warehouse || 'DEFAULT').toUpperCase().trim();
        if (!shipmentsByWh.has(whKey)) shipmentsByWh.set(whKey, []);
        shipmentsByWh.get(whKey)!.push(s);
      });

      for (const [whKey, sList] of shipmentsByWh.entries()) {
        const sumQty = sList.reduce((acc: number, s: any) => acc + (normalizeCarton(s.quantity) || 0), 0);
        const origQty = normalizeCarton(sList[0]?.originalTotalQuantity);
        if (origQty === inputCtnNum || sumQty === inputCtnNum) {
          matchedShipment = sList[0];
          targetWarehouse = matchedShipment.warehouse || '';
          totalWarehouseCtnNum = origQty !== null && origQty > 0 ? origQty : sumQty;
          recordSource = 'shipment';
          break;
        }
      }

      if (!matchedShipment) {
        matchedShipment = allShipments[0];
        targetWarehouse = matchedShipment.warehouse || '';
        const origQty = normalizeCarton(matchedShipment.originalTotalQuantity);
        totalWarehouseCtnNum = origQty !== null && origQty > 0 ? origQty : normalizeCarton(matchedShipment.quantity);
        recordSource = 'shipment';
      }
    }

    if ((!matchedWh && !matchedShipment) || totalWarehouseCtnNum === null) {
      return NextResponse.json({
        success: false,
        message: \`Receipt #\${inputReceiptNo} was not found in warehouse records. Please check the receipt number on your warehouse slip.\`
      }, { status: 404 });
    }

    // 4. Verify CTN matches TOTAL CTN RECEIVED IN WAREHOUSE
    if (totalWarehouseCtnNum !== inputCtnNum) {
      const warehouseHints = matchingWhItems.map((w: any) => \`\${w.warehouse || 'Warehouse'} (\${w.quantity} CTN)\`).join(', ');
      return NextResponse.json({
        success: false,
        message: matchingWhItems.length > 1
          ? \`Receipt #\${inputReceiptNo} exists in multiple warehouses: \${warehouseHints}. Carton count (\${inputCtn} CTN) does not match. Please enter the exact total cartons received as per your slip.\`
          : \`Verification failed: Carton count (\${inputCtn} CTN) does not match total packages received in warehouse for Receipt #\${inputReceiptNo} (\${totalWarehouseCtnNum} CTN). Please enter total cartons received as per your slip.\`
      }, { status: 400 });
    }

    // 5. Verification passed: save with explicit warehouse code and receipt identifier
    const chosen = matchedWh || matchedShipment;
    const newEntry: IReceiptEntry = {
      id: 'rec_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      receiptNo: chosen.receipt || inputReceiptNo,
      warehouse: targetWarehouse,
      warehouseReceiptId: targetWhId,
      marka: String(matchedWh?.mainMarka || matchedWh?.subMarka || matchedShipment?.mainMarka || matchedShipment?.subMarka || trackingDoc.name || '').trim(),
      itemName: String(matchedWh?.english || matchedWh?.commodity || matchedWh?.chinese || (matchedWh?.items && matchedWh.items[0]?.itemName) || matchedShipment?.english || matchedShipment?.commodity || '').trim(),
      cbm: String(matchedWh?.volume || matchedShipment?.volume || '').trim(),
      ctn: String(totalWarehouseCtnNum),
      weight: String(matchedWh?.weight || matchedShipment?.weight || '').trim(),
      containerNo: String(matchedShipment?.container || 'In Warehouse (Not Loaded)').trim(),
      actualContainerNo: '',
      eta: String(matchedShipment?.destinationDate || matchedShipment?.eta || '').trim(),
      status: String(matchedShipment?.status || matchedWh?.status || 'Received in Warehouse').trim(),
      adminNotes: \`Self-added by customer for \${targetWarehouse || 'China'} Warehouse (\${totalWarehouseCtnNum} CTN)\`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    trackingDoc.receipts.push(newEntry);
    trackingDoc.updatedAt = new Date();
    await trackingDoc.save();

    const whDisplayLabel = targetWarehouse ? \`\${targetWarehouse} Warehouse\` : 'Warehouse';
    return NextResponse.json({
      success: true,
      message: \`✓ Receipt #\${newEntry.receiptNo} verified & linked from \${whDisplayLabel} (\${newEntry.ctn} CTN)!\`,`;

code = code.replace(targetSection.replace(/\r?\n/g, '\r\n'), replacementSection.replace(/\r?\n/g, '\r\n'));
if (!code.includes('whDisplayLabel')) {
  code = code.replace(targetSection.replace(/\r\n/g, '\n'), replacementSection.replace(/\r\n/g, '\n'));
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Updated app/api/track/receipt-link/[token]/add-receipt/route.ts successfully');
