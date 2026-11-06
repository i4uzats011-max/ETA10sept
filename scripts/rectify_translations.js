const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Load translation engine from lib/translate.ts
const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'translate.ts'), 'utf8');
const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const mod = {};
const fn = new Function('exports', 'require', 'module', result.outputText);
fn(mod, require, { exports: mod });
const { translateToEnglish, hasChineseCharacters } = mod;

function getMongoUri() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('MONGO_URI=')) {
        return trimmed.replace('MONGO_URI=', '').trim();
      }
    }
  }
  return '';
}

async function run() {
  const uri = getMongoUri();
  await mongoose.connect(uri);
  console.log('Connected to MongoDB for Translation Rectification');
  const db = mongoose.connection.db;

  const shipments = await db.collection('shipments').find({}).toArray();
  const receipts = await db.collection('warehousereceipts').find({}).toArray();

  let shipUpdatedCount = 0;
  for (const s of shipments) {
    const rawCn = s.chinese || (hasChineseCharacters(s.commodity) ? s.commodity : '');
    if (rawCn) {
      const properEnglish = translateToEnglish(rawCn);

      // Check if english needs updating
      const isEnglishBad =
        !s.english ||
        s.english === 'General Merchandise' ||
        s.english === 'N/A' ||
        hasChineseCharacters(s.english);

      const isCommodityBad =
        s.commodity === 'General Merchandise' ||
        hasChineseCharacters(s.commodity);

      if (isEnglishBad || isCommodityBad) {
        const updateDoc = {};
        if (isEnglishBad) {
          updateDoc.english = properEnglish;
        }
        if (isCommodityBad) {
          updateDoc.commodity = properEnglish;
        }
        if (!s.chinese && hasChineseCharacters(rawCn)) {
          updateDoc.chinese = rawCn;
        }

        await db.collection('shipments').updateOne(
          { _id: s._id },
          { $set: updateDoc }
        );
        shipUpdatedCount++;
      }
    }
  }

  console.log(`Shipments updated with proper English translations: ${shipUpdatedCount}`);

  let rcptUpdatedCount = 0;
  for (const r of receipts) {
    const rawCn = r.chinese || (hasChineseCharacters(r.commodity) ? r.commodity : '');
    let updatedNeeded = false;
    const updateDoc = {};

    if (rawCn) {
      const properEnglish = translateToEnglish(rawCn);

      const isEnglishBad =
        !r.english ||
        r.english === 'General Merchandise' ||
        r.english === 'N/A' ||
        hasChineseCharacters(r.english);

      const isCommodityBad =
        r.commodity === 'General Merchandise' ||
        hasChineseCharacters(r.commodity);

      if (isEnglishBad) {
        updateDoc.english = properEnglish;
        updatedNeeded = true;
      }
      if (isCommodityBad) {
        updateDoc.commodity = properEnglish;
        updatedNeeded = true;
      }
      if (!r.chinese && hasChineseCharacters(rawCn)) {
        updateDoc.chinese = rawCn;
        updatedNeeded = true;
      }
    }

    // Also check embedded items array
    if (Array.isArray(r.items) && r.items.length > 0) {
      let itemsModified = false;
      const updatedItems = r.items.map((it) => {
        const itCn = it.chinese || (hasChineseCharacters(it.itemName) ? it.itemName : '');
        if (itCn) {
          const properItEn = translateToEnglish(itCn);
          if (
            !it.english ||
            it.english === 'General Merchandise' ||
            hasChineseCharacters(it.english)
          ) {
            itemsModified = true;
            return {
              ...it,
              english: properItEn,
              itemName: properItEn,
              chinese: itCn,
            };
          }
        }
        return it;
      });

      if (itemsModified) {
        updateDoc.items = updatedItems;
        updatedNeeded = true;
      }
    }

    if (updatedNeeded) {
      await db.collection('warehousereceipts').updateOne(
        { _id: r._id },
        { $set: updateDoc }
      );
      rcptUpdatedCount++;
    }
  }

  console.log(`Warehouse receipts updated with proper English translations: ${rcptUpdatedCount}`);

  console.log('\n--- VERIFYING USER SPECIFIC ITEMS ---');
  const userTest = ['甲油胶', '点火线圈', '女包', '驱动电源', '传感器', '万用表'];
  for (const item of userTest) {
    const sDoc = await db.collection('shipments').findOne({ chinese: item });
    console.log(`Shipment for "${item}": chinese="${sDoc?.chinese}", english="${sDoc?.english}", commodity="${sDoc?.commodity}"`);
    const rDoc = await db.collection('warehousereceipts').findOne({ chinese: item });
    console.log(`Receipt for "${item}": chinese="${rDoc?.chinese}", english="${rDoc?.english}", commodity="${rDoc?.commodity}"`);
  }

  await mongoose.disconnect();
  console.log('\nTranslation rectification successfully completed!');
}

run().catch((err) => {
  console.error('Rectification error:', err);
  process.exit(1);
});
