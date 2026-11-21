const mongoose = require('mongoose');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Read .env if needed
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const uri = env.MONGO_URI || 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';
const geminiApiKey = env.GEMINI_API_KEY;

const CHINESE_CHAR_REGEX = /[\u4e00-\u9fa5]/;

// Call Gemini API to translate Chinese text to English
async function translateWithGemini(text) {
  if (!geminiApiKey || !text) return text;
  
  const postData = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `You are a freight logistics translator. Translate this Chinese commodity/cargo item name into clean, professional, concise English. Do NOT return explanation, quotes, or markdown, ONLY the translated English item name: "${text}"`
          }
        ]
      }
    ]
  });

  return new Promise((resolve) => {
    // Try v1beta models/gemini-1.5-flash or gemini-2.0-flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const candidate = parsed?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (candidate) {
            resolve(candidate.replace(/^["']|["']$/g, '').trim());
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const whCollection = db.collection('warehousereceipts');
  const shipmentCollection = db.collection('shipments');

  console.log('Checking warehousereceipts for Chinese item names...');
  const whCursor = whCollection.find({
    $or: [
      { commodity: { $regex: '[\u4e00-\u9fa5]' } },
      { english: { $regex: '[\u4e00-\u9fa5]' } },
      { 'items.itemName': { $regex: '[\u4e00-\u9fa5]' } }
    ]
  });

  const whToFix = await whCursor.toArray();
  console.log(`Found ${whToFix.length} warehouse receipts with Chinese characters in item name.`);

  let whFixedCount = 0;
  for (const doc of whToFix) {
    let changed = false;
    const updates = {};

    if (doc.commodity && CHINESE_CHAR_REGEX.test(doc.commodity)) {
      const translated = await translateWithGemini(doc.commodity);
      if (translated) {
        updates.commodity = translated;
        if (!doc.english || CHINESE_CHAR_REGEX.test(doc.english)) {
          updates.english = translated;
        }
        changed = true;
      }
    } else if (doc.english && CHINESE_CHAR_REGEX.test(doc.english)) {
      const translated = await translateWithGemini(doc.english);
      if (translated) {
        updates.english = translated;
        if (!doc.commodity) updates.commodity = translated;
        changed = true;
      }
    }

    if (Array.isArray(doc.items)) {
      let itemsChanged = false;
      const newItems = doc.items.map(it => {
        if (it.itemName && CHINESE_CHAR_REGEX.test(it.itemName)) {
          return it; // handle below
        }
        return it;
      });

      for (let i = 0; i < doc.items.length; i++) {
        const it = doc.items[i];
        if (it.itemName && CHINESE_CHAR_REGEX.test(it.itemName)) {
          const translated = await translateWithGemini(it.itemName);
          if (translated) {
            it.chinese = it.chinese || it.itemName;
            it.itemName = translated;
            it.english = translated;
            itemsChanged = true;
          }
        }
      }
      if (itemsChanged) {
        updates.items = doc.items;
        changed = true;
      }
    }

    if (changed) {
      await whCollection.updateOne({ _id: doc._id }, { $set: updates });
      whFixedCount++;
      console.log(`Fixed receipt ${doc.receipt}:`, updates);
    }
  }

  console.log(`Checking shipments for Chinese characters in commodity/english...`);
  const shipCursor = shipmentCollection.find({
    $or: [
      { commodity: { $regex: '[\u4e00-\u9fa5]' } },
      { english: { $regex: '[\u4e00-\u9fa5]' } }
    ]
  });

  const shipToFix = await shipCursor.toArray();
  console.log(`Found ${shipToFix.length} shipments with Chinese characters.`);

  let shipFixedCount = 0;
  for (const doc of shipToFix) {
    let changed = false;
    const updates = {};

    const textToTranslate = (doc.commodity && CHINESE_CHAR_REGEX.test(doc.commodity)) ? doc.commodity : doc.english;
    if (textToTranslate && CHINESE_CHAR_REGEX.test(textToTranslate)) {
      const translated = await translateWithGemini(textToTranslate);
      if (translated) {
        updates.commodity = translated;
        updates.english = translated;
        changed = true;
      }
    }

    if (changed) {
      await shipmentCollection.updateOne({ _id: doc._id }, { $set: updates });
      shipFixedCount++;
      console.log(`Fixed shipment ${doc.receipt} (${doc.container}):`, updates);
    }
  }

  console.log(`Done! Fixed ${whFixedCount} warehouse receipts and ${shipFixedCount} shipments. Only item names were updated.`);
  await mongoose.disconnect();
}

run().catch(console.error);
