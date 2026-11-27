const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');

const uri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

const sampleCsv = `stockstatus,warehouse,date,Warehouse entry,Receipt,quantity,weight,volumem³,commodity,packaging,mark,plate,phone,delivery,type,Container No. ,Container No. 
库存中,总部,2026-11-03,RS-21,RFN27NOV26,9,3600,43.429,模具平台,,TED,,,,,USSI-358,GESU6221024
库存中,九边仓库,2026-11-20,RS-21,261120002,28,631.1,2.87,汽车LED灯,QR1119,CS,粤EDZ0505,13587551339,HUBERT,custom,USSI-358,GESU6221024
库存中,九边仓库,2026-11-23,RS-21,261123006,21,220,0.92,汽车启动电源,QR1121,VIP-1,粤ACB6988,13928450908,货拉拉,battery,USSI-358,GESU6221024
库存中,九边仓库,2026-11-19,RS-21,261119038,76,1216,3.53,硅胶套管,QR1119,power adison,粤ADJ5639,13610451421,雅博雷照明科技,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-19,RS-21,261119049,12,304,0.38,撞钉，螺丝,QR1119,MKSSS,粤ADR9627,13656059685,越盛五金,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-19,RS-21,261119054,87,1028.2,1.94,开关电源,QR1118,ADISON,粤AP06459,13925394903,明联电子,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-20,RS-21,261120007,106,2200,1.5,套筒,QR1116,SR,粤A6QL00,18678016686,ANNA,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-20,RS-21,261120014,29,668,1.7,接线端子,QR1119,RCM-SM,JDK9065,15549560381,中山鸿跃照明电器厂,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-20,RS-21,261120030,2,1543.5,1.8,隔音垫,QR1119,SA,粤A5Y3Y7,13336437751,周小姐,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-19,RS-21,261119048,16,290,0.472,撞钉,QR1119,AKMT,粤ADR9627,13656059685,越盛五金,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-18,RS-21,261118085,51,813,3.78,LED汽车灯,QR1118,GLD,粤AE87406,13690708054,佛山奥乐电子,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-23,RS-21,261123050,102,1384,3.5,汽车功放机,QR1123,dragon HM,,,,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-23,RS-21,261123012,13,250,1.69,防水帽,QR1121,CHINU-CABLE,,,,normal,USSI-358,GESU6221024
库存中,九边仓库,2026-11-23,RS-21,261123023,37,672.5,0.48,拔叉螺丝,QR1123,NKM,,,,normal,USSI-358,GESU6221024`;

async function testMatch() {
  await mongoose.connect(uri);
  const rows = parse(sampleCsv, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Parsed ${rows.length} rows.`);

  const receipts = rows.map(r => r.Receipt.trim());
  const foundDocs = await mongoose.connection.collection('warehousereceipts').find({
    receipt: { $in: receipts }
  }).toArray();

  console.log(`Found ${foundDocs.length} matching documents in warehousereceipts collection.`);
  
  for (const r of rows) {
    const rcpt = r.Receipt.trim();
    const entry = r['Warehouse entry'] ? r['Warehouse entry'].trim() : '';
    const wh = r.warehouse.trim();
    const qty = parseInt(r.quantity, 10);
    const matches = foundDocs.filter(d => d.receipt.toUpperCase() === rcpt.toUpperCase());
    console.log(`Row: Receipt=${rcpt}, Wh=${wh}, Entry=${entry}, Qty=${qty} -> DB Matches=${matches.length}: ${matches.map(m => `[wh=${m.warehouse}, entry=${m.warehouseEntry}, total=${m.quantity}, remaining=${m.remainingQuantity}]`).join('; ')}`);
  }

  process.exit(0);
}

testMatch().catch(err => {
  console.error(err);
  process.exit(1);
});
