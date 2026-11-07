const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'receipts.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to ensure data directory and file exist
function getReceipts() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading receipts data:', err);
    return [];
  }
}

function saveReceipts(receipts) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(receipts, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing receipts data:', err);
  }
}

// Helper to generate secure random token (e.g. trk_4a8f9c2d1e)
function generateTrackingToken() {
  return 'trk_' + crypto.randomBytes(6).toString('hex');
}

// Calculate remaining days between now and ETA
function calculateRemainDays(etaString) {
  if (!etaString) return null;
  const etaDate = new Date(etaString);
  if (isNaN(etaDate.getTime())) return null;

  const now = new Date();
  const etaStart = new Date(etaDate.getFullYear(), etaDate.getMonth(), etaDate.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = etaStart.getTime() - nowStart.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Public tracking page
app.get('/track/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

// PUBLIC API: Strictly returns ONLY allowed fields:
// Receipt No, Item Name, CBM, CTN, Weight, Container No. (not actual), ETA, Remaindays
app.get('/api/track/:token', (req, res) => {
  const token = req.params.token.trim();
  const allReceipts = getReceipts();

  // Find all receipts matching this tracking link
  const matchedReceipts = allReceipts.filter(r => r.trackingToken === token);

  if (!matchedReceipts || matchedReceipts.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No shipment found for this tracking link.'
    });
  }

  // Strict whitelist of fields for the public
  const publicReceipts = matchedReceipts.map(r => {
    const remainDays = calculateRemainDays(r.eta);
    return {
      receiptNo: r.receiptNo || 'N/A',
      itemName: r.itemName || 'N/A',
      cbm: r.cbm || '0',
      ctn: r.ctn || '0',
      weight: r.weight || '0',
      containerNo: r.containerNo || 'N/A', // Container No. (not actual)
      eta: r.eta || null,
      remainDays: remainDays,
      updatedAt: r.updatedAt || r.createdAt
    };
  });

  res.json({
    success: true,
    trackingToken: token,
    count: publicReceipts.length,
    receipts: publicReceipts
  });
});

// ==========================================
// ADMIN ROUTES & APIS
// ==========================================

// Admin dashboard page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin API: Get all receipts
app.get('/api/admin/receipts', (req, res) => {
  const receipts = getReceipts().map(r => ({
    ...r,
    remainDays: calculateRemainDays(r.eta)
  }));
  res.json({ success: true, receipts });
});

// Admin API: Get unique tracking tokens for linking new receipt to existing link
app.get('/api/admin/tokens', (req, res) => {
  const receipts = getReceipts();
  const tokenMap = {};

  receipts.forEach(r => {
    if (!tokenMap[r.trackingToken]) {
      tokenMap[r.trackingToken] = {
        token: r.trackingToken,
        receipts: []
      };
    }
    tokenMap[r.trackingToken].receipts.push(r.receiptNo);
  });

  res.json({ success: true, tokens: Object.values(tokenMap) });
});

// Admin API: Create a new receipt (can generate new link OR use existing link)
app.post('/api/admin/receipts', (req, res) => {
  const {
    receiptNo,
    itemName,
    cbm,
    ctn,
    weight,
    containerNo,
    actualContainerNo,
    eta,
    adminNotes,
    trackingTokenOption, // 'new' or 'existing'
    existingToken
  } = req.body;

  if (!receiptNo || !receiptNo.trim()) {
    return res.status(400).json({ success: false, message: 'Receipt No. is required.' });
  }

  const receipts = getReceipts();

  // Check duplicate receipt number
  const exists = receipts.some(r => r.receiptNo.toLowerCase() === receiptNo.trim().toLowerCase());
  if (exists) {
    return res.status(400).json({ success: false, message: `Receipt No. "${receiptNo.trim()}" already exists.` });
  }

  // Determine tracking token
  let token = '';
  if (trackingTokenOption === 'existing' && existingToken && existingToken.trim()) {
    token = existingToken.trim();
  } else {
    token = generateTrackingToken();
  }

  const newReceipt = {
    id: 'rec_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    trackingToken: token,
    receiptNo: receiptNo.trim(),
    itemName: (itemName || '').trim(),
    cbm: (cbm || '').trim(),
    ctn: (ctn || '').trim(),
    weight: (weight || '').trim(),
    containerNo: (containerNo || '').trim(), // Public display: Container No. (not actual)
    actualContainerNo: (actualContainerNo || '').trim(), // Admin only record
    eta: eta ? eta.trim() : null,
    adminNotes: (adminNotes || '').trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  receipts.unshift(newReceipt);
  saveReceipts(receipts);

  res.status(201).json({
    success: true,
    message: 'Receipt added successfully.',
    receipt: {
      ...newReceipt,
      remainDays: calculateRemainDays(newReceipt.eta)
    }
  });
});

// Admin API: Update a receipt (e.g. ETA, container no, weights, etc.)
app.put('/api/admin/receipts/:id', (req, res) => {
  const id = req.params.id;
  const receipts = getReceipts();
  const index = receipts.findIndex(r => r.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Receipt not found.' });
  }

  const existing = receipts[index];
  const {
    receiptNo,
    itemName,
    cbm,
    ctn,
    weight,
    containerNo,
    actualContainerNo,
    eta,
    adminNotes,
    trackingToken
  } = req.body;

  receipts[index] = {
    ...existing,
    receiptNo: receiptNo !== undefined ? receiptNo.trim() : existing.receiptNo,
    itemName: itemName !== undefined ? itemName.trim() : existing.itemName,
    cbm: cbm !== undefined ? cbm.trim() : existing.cbm,
    ctn: ctn !== undefined ? ctn.trim() : existing.ctn,
    weight: weight !== undefined ? weight.trim() : existing.weight,
    containerNo: containerNo !== undefined ? containerNo.trim() : existing.containerNo,
    actualContainerNo: actualContainerNo !== undefined ? actualContainerNo.trim() : existing.actualContainerNo,
    eta: eta !== undefined ? eta.trim() : existing.eta,
    adminNotes: adminNotes !== undefined ? adminNotes.trim() : existing.adminNotes,
    trackingToken: trackingToken !== undefined ? trackingToken.trim() : existing.trackingToken,
    updatedAt: new Date().toISOString()
  };

  saveReceipts(receipts);

  res.json({
    success: true,
    message: 'Receipt updated successfully.',
    receipt: {
      ...receipts[index],
      remainDays: calculateRemainDays(receipts[index].eta)
    }
  });
});

// Admin API: Delete a receipt
app.delete('/api/admin/receipts/:id', (req, res) => {
  const id = req.params.id;
  let receipts = getReceipts();
  const initialLength = receipts.length;
  receipts = receipts.filter(r => r.id !== id);

  if (receipts.length === initialLength) {
    return res.status(404).json({ success: false, message: 'Receipt not found.' });
  }

  saveReceipts(receipts);
  res.json({ success: true, message: 'Receipt deleted successfully.' });
});

// Fallback home redirect to admin or public track
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`Sample Tracking: http://localhost:${PORT}/track/trk_alpha789`);
});
