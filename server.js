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

// Helper to resolve receipt status backward-compatibly without modifying existing data
function resolveReceiptStatus(r) {
  if (r.status) return r.status;
  if (r.deliveryDate) return 'delivered';
  if (!r.containerNo || r.containerNo.toLowerCase().includes('warehouse')) {
    return 'in_warehouse';
  }
  return 'in_transit';
}

// Normalize receipt object for admin and public views
function normalizeReceipt(r) {
  const status = resolveReceiptStatus(r);
  const remainDays = status === 'delivered' ? null : calculateRemainDays(r.eta);
  return {
    ...r,
    status: status,
    deliveryDate: r.deliveryDate || null,
    remainDays: remainDays
  };
}

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Public tracking page
app.get('/track/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

// PUBLIC API: Returns allowed fields strictly:
// Receipt No, Item Name, CBM, CTN, Weight, Container No. (not actual), Status, Delivery Date, ETA, Remaindays
app.get('/api/track/:token', (req, res) => {
  const token = (req.params.token || '').trim();
  const allReceipts = getReceipts();

  // Find all receipts matching this tracking link
  const matchedReceipts = allReceipts.filter(r => r.trackingToken && r.trackingToken.trim() === token);

  if (!matchedReceipts || matchedReceipts.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No shipment found for this tracking link.'
    });
  }

  // Strict whitelist of fields for the public
  const publicReceipts = matchedReceipts.map(r => {
    const status = resolveReceiptStatus(r);
    const remainDays = status === 'delivered' ? null : calculateRemainDays(r.eta);

    // If receipt is in warehouse without container, display friendly status
    let displayContainer = r.containerNo;
    if (!displayContainer || displayContainer.trim() === '' || status === 'in_warehouse') {
      displayContainer = displayContainer || 'In Warehouse (Not Loaded)';
    }

    return {
      receiptNo: r.receiptNo || 'N/A',
      itemName: r.itemName || 'N/A',
      cbm: r.cbm || '0',
      ctn: r.ctn || '0',
      weight: r.weight || '0',
      containerNo: displayContainer, // Public display: Container No. (not actual)
      status: status, // 'in_warehouse' | 'in_transit' | 'delivered'
      deliveryDate: r.deliveryDate || null,
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
  const receipts = getReceipts().map(normalizeReceipt);
  res.json({ success: true, receipts });
});

// Admin API: Get unique tracking tokens with summary
app.get('/api/admin/tokens', (req, res) => {
  const receipts = getReceipts();
  const tokenMap = {};

  receipts.forEach(r => {
    if (r.trackingToken && r.trackingToken.trim()) {
      const tok = r.trackingToken.trim();
      if (!tokenMap[tok]) {
        tokenMap[tok] = {
          token: tok,
          receipts: [],
          receiptCount: 0,
          deliveredCount: 0,
          activeCount: 0
        };
      }
      tokenMap[tok].receipts.push(r.receiptNo);
      tokenMap[tok].receiptCount++;
      const st = resolveReceiptStatus(r);
      if (st === 'delivered') {
        tokenMap[tok].deliveredCount++;
      } else {
        tokenMap[tok].activeCount++;
      }
    }
  });

  res.json({ success: true, tokens: Object.values(tokenMap) });
});

// Admin API: Get unlinked receipts (e.g. warehouse receipts not yet attached to an ETA link)
app.get('/api/admin/unlinked-receipts', (req, res) => {
  const receipts = getReceipts()
    .filter(r => !r.trackingToken || !r.trackingToken.trim())
    .map(normalizeReceipt);
  res.json({ success: true, receipts });
});

// Admin API: Create a new receipt (can generate new link, add to existing link, or keep unlinked in warehouse)
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
    status, // 'in_warehouse', 'in_transit', 'delivered'
    deliveryDate,
    trackingTokenOption, // 'new', 'existing', or 'none' (warehouse/unlinked)
    existingToken
  } = req.body;

  if (!receiptNo || !receiptNo.trim()) {
    return res.status(400).json({ success: false, message: 'Receipt No. is required.' });
  }

  const receipts = getReceipts();

  // Check duplicate receipt number
  const exists = receipts.some(r => r.receiptNo && r.receiptNo.toLowerCase() === receiptNo.trim().toLowerCase());
  if (exists) {
    return res.status(400).json({ success: false, message: `Receipt No. "${receiptNo.trim()}" already exists.` });
  }

  const resolvedStatus = status || (deliveryDate ? 'delivered' : (containerNo && !containerNo.toLowerCase().includes('warehouse') ? 'in_transit' : 'in_warehouse'));

  // Determine tracking token
  let token = null;
  if (trackingTokenOption === 'existing' && existingToken && existingToken.trim()) {
    token = existingToken.trim();
  } else if (trackingTokenOption === 'new') {
    token = generateTrackingToken();
  } else if (trackingTokenOption === 'none') {
    token = null;
  } else if (!trackingTokenOption && resolvedStatus !== 'in_warehouse') {
    token = generateTrackingToken();
  }

  let finalContainerNo = (containerNo || '').trim();
  if (!finalContainerNo && resolvedStatus === 'in_warehouse') {
    finalContainerNo = 'In Warehouse (Not Loaded)';
  }

  const newReceipt = {
    id: 'rec_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    trackingToken: token,
    receiptNo: receiptNo.trim(),
    itemName: (itemName || '').trim(),
    cbm: (cbm || '').trim(),
    ctn: (ctn || '').trim(),
    weight: (weight || '').trim(),
    containerNo: finalContainerNo,
    actualContainerNo: (actualContainerNo || '').trim(),
    eta: eta ? eta.trim() : null,
    status: resolvedStatus,
    deliveryDate: resolvedStatus === 'delivered' ? (deliveryDate ? deliveryDate.trim() : new Date().toISOString().split('T')[0]) : null,
    adminNotes: (adminNotes || '').trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  receipts.unshift(newReceipt);
  saveReceipts(receipts);

  res.status(201).json({
    success: true,
    message: 'Receipt added successfully.',
    receipt: normalizeReceipt(newReceipt)
  });
});

// Admin API: Update a receipt
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
    status,
    deliveryDate,
    trackingToken
  } = req.body;

  // RULE CHECK: "if any receipt link any link then those receipt can not link again"
  if (trackingToken !== undefined) {
    const targetToken = trackingToken ? trackingToken.trim() : null;
    const currentToken = existing.trackingToken ? existing.trackingToken.trim() : null;

    // If attempting to link to a different link while already linked
    if (currentToken && targetToken && currentToken !== targetToken) {
      return res.status(400).json({
        success: false,
        message: `Receipt "${existing.receiptNo}" is already linked to link "${currentToken}". It cannot be linked again. You must remove it from that link first.`
      });
    }
  }

  // Check duplicate receipt number if changing receiptNo
  if (receiptNo && receiptNo.trim().toLowerCase() !== existing.receiptNo.toLowerCase()) {
    const dup = receipts.some(r => r.id !== id && r.receiptNo && r.receiptNo.toLowerCase() === receiptNo.trim().toLowerCase());
    if (dup) {
      return res.status(400).json({ success: false, message: `Receipt No. "${receiptNo.trim()}" already exists.` });
    }
  }

  const updatedStatus = status !== undefined ? status : resolveReceiptStatus(existing);
  const updatedDeliveryDate = updatedStatus === 'delivered'
    ? (deliveryDate !== undefined ? deliveryDate : (existing.deliveryDate || new Date().toISOString().split('T')[0]))
    : null;

  receipts[index] = {
    ...existing,
    receiptNo: receiptNo !== undefined ? receiptNo.trim() : existing.receiptNo,
    itemName: itemName !== undefined ? itemName.trim() : existing.itemName,
    cbm: cbm !== undefined ? cbm.trim() : existing.cbm,
    ctn: ctn !== undefined ? ctn.trim() : existing.ctn,
    weight: weight !== undefined ? weight.trim() : existing.weight,
    containerNo: containerNo !== undefined ? containerNo.trim() : existing.containerNo,
    actualContainerNo: actualContainerNo !== undefined ? actualContainerNo.trim() : existing.actualContainerNo,
    eta: eta !== undefined ? (eta ? eta.trim() : null) : existing.eta,
    status: updatedStatus,
    deliveryDate: updatedDeliveryDate,
    adminNotes: adminNotes !== undefined ? adminNotes.trim() : existing.adminNotes,
    trackingToken: trackingToken !== undefined ? (trackingToken ? trackingToken.trim() : null) : existing.trackingToken,
    updatedAt: new Date().toISOString()
  };

  saveReceipts(receipts);

  res.json({
    success: true,
    message: 'Receipt updated successfully.',
    receipt: normalizeReceipt(receipts[index])
  });
});

// Admin API: Bulk update multiple receipts (ETA, status, delivery date, container)
app.post('/api/admin/receipts/bulk-update', (req, res) => {
  const { ids, eta, status, deliveryDate, containerNo, actualContainerNo } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'No receipt IDs provided for bulk update.' });
  }

  const receipts = getReceipts();
  let updatedCount = 0;

  receipts.forEach(r => {
    if (ids.includes(r.id)) {
      if (eta !== undefined) {
        r.eta = eta ? eta.trim() : null;
      }
      if (status !== undefined) {
        r.status = status;
        if (status === 'delivered') {
          r.deliveryDate = deliveryDate ? deliveryDate.trim() : (r.deliveryDate || new Date().toISOString().split('T')[0]);
        } else {
          r.deliveryDate = null;
        }
      }
      if (containerNo !== undefined) {
        r.containerNo = containerNo.trim();
      }
      if (actualContainerNo !== undefined) {
        r.actualContainerNo = actualContainerNo.trim();
      }
      r.updatedAt = new Date().toISOString();
      updatedCount++;
    }
  });

  saveReceipts(receipts);

  res.json({
    success: true,
    message: `Successfully updated ${updatedCount} receipt(s).`,
    updatedCount
  });
});

// Admin API: Manage ETA link associations (add, remove, bulk update ETA for link)
app.post('/api/admin/links/manage', (req, res) => {
  const { action, token, receiptId, receiptIds, eta } = req.body;
  const receipts = getReceipts();

  // ACTION: Unlink a single receipt from its tracking link
  if (action === 'unlink') {
    if (!receiptId) {
      return res.status(400).json({ success: false, message: 'receiptId is required to unlink.' });
    }
    const target = receipts.find(r => r.id === receiptId);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }
    target.trackingToken = null;
    target.updatedAt = new Date().toISOString();
    saveReceipts(receipts);
    return res.json({ success: true, message: `Receipt "${target.receiptNo}" removed from tracking link.` });
  }

  // ACTION: Bulk unlink multiple receipts
  if (action === 'bulk_unlink') {
    if (!receiptIds || !Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({ success: false, message: 'receiptIds array is required.' });
    }
    let count = 0;
    receipts.forEach(r => {
      if (receiptIds.includes(r.id)) {
        r.trackingToken = null;
        r.updatedAt = new Date().toISOString();
        count++;
      }
    });
    saveReceipts(receipts);
    return res.json({ success: true, message: `${count} receipt(s) unlinked successfully.` });
  }

  // ACTION: Link receipts to a tracking token
  if (action === 'link_receipts') {
    if (!token || !token.trim()) {
      return res.status(400).json({ success: false, message: 'Target tracking token is required.' });
    }
    if (!receiptIds || !Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({ success: false, message: 'receiptIds array is required.' });
    }

    const cleanToken = token.trim();

    // RULE: "if any receipt link any link then those receipt can not link again"
    const alreadyLinked = [];
    receipts.forEach(r => {
      if (receiptIds.includes(r.id)) {
        if (r.trackingToken && r.trackingToken.trim() && r.trackingToken.trim() !== cleanToken) {
          alreadyLinked.push(`${r.receiptNo} (already in ${r.trackingToken})`);
        }
      }
    });

    if (alreadyLinked.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot link: The following receipt(s) are already linked to an ETA link: ${alreadyLinked.join(', ')}. Please remove them from their existing link first.`
      });
    }

    let linkedCount = 0;
    receipts.forEach(r => {
      if (receiptIds.includes(r.id)) {
        r.trackingToken = cleanToken;
        r.updatedAt = new Date().toISOString();
        linkedCount++;
      }
    });

    saveReceipts(receipts);
    return res.json({ success: true, message: `${linkedCount} receipt(s) linked to "${cleanToken}".` });
  }

  // ACTION: Update ETA for all receipts under a link
  if (action === 'update_link_eta') {
    if (!token || !token.trim()) {
      return res.status(400).json({ success: false, message: 'Tracking token is required.' });
    }
    if (!eta) {
      return res.status(400).json({ success: false, message: 'New ETA date is required.' });
    }

    const cleanToken = token.trim();
    let count = 0;
    receipts.forEach(r => {
      if (r.trackingToken && r.trackingToken.trim() === cleanToken) {
        r.eta = eta.trim();
        r.updatedAt = new Date().toISOString();
        count++;
      }
    });

    saveReceipts(receipts);
    return res.json({ success: true, message: `Updated ETA to ${eta.trim()} for ${count} receipt(s) under link ${cleanToken}.` });
  }

  return res.status(400).json({ success: false, message: 'Invalid action.' });
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

// Admin API: Bulk delete receipts (delete one or more receipts)
app.post('/api/admin/receipts/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Receipt IDs array is required.' });
  }

  let receipts = getReceipts();
  const initialLength = receipts.length;
  receipts = receipts.filter(r => !ids.includes(r.id));
  const deletedCount = initialLength - receipts.length;

  saveReceipts(receipts);
  res.json({
    success: true,
    message: `Successfully deleted ${deletedCount} receipt(s).`,
    deletedCount
  });
});

// Admin API: Get all Allocated Tracking Links with nested receipts and summary
app.get('/api/admin/links', (req, res) => {
  const receipts = getReceipts().map(normalizeReceipt);
  const linkMap = {};

  receipts.forEach(r => {
    const token = (r.trackingToken || '').trim();
    if (token) {
      if (!linkMap[token]) {
        linkMap[token] = {
          token: token,
          allocatedLinkName: token,
          receipts: [],
          totalCbm: 0,
          totalCtn: 0,
          totalWeight: 0,
          etas: [],
          activeCount: 0,
          deliveredCount: 0,
          warehouseCount: 0,
          updatedAt: r.updatedAt || r.createdAt
        };
      }
      linkMap[token].receipts.push(r);
      const cbmNum = parseFloat(r.cbm);
      if (!isNaN(cbmNum)) linkMap[token].totalCbm += cbmNum;
      const ctnNum = parseInt(r.ctn, 10);
      if (!isNaN(ctnNum)) linkMap[token].totalCtn += ctnNum;
      const wtNum = parseFloat(r.weight);
      if (!isNaN(wtNum)) linkMap[token].totalWeight += wtNum;

      if (r.eta) linkMap[token].etas.push(r.eta);
      if (r.status === 'delivered') linkMap[token].deliveredCount++;
      else if (r.status === 'in_warehouse') linkMap[token].warehouseCount++;
      else linkMap[token].activeCount++;
    }
  });

  const links = Object.values(linkMap).map(l => {
    l.totalCbm = Math.round(l.totalCbm * 100) / 100;
    l.receiptCount = l.receipts.length;
    l.etas.sort();
    l.minEta = l.etas[0] || null;
    l.maxEta = l.etas[l.etas.length - 1] || null;
    return l;
  });

  res.json({ success: true, links });
});

// Admin API: Delete single Allocated Link Name
app.delete('/api/admin/links/:token', (req, res) => {
  const token = (req.params.token || '').trim();
  const deleteReceipts = req.query.deleteReceipts === 'true' || req.body.deleteReceipts === true;
  let receipts = getReceipts();

  const matchingReceipts = receipts.filter(r => r.trackingToken && r.trackingToken.trim() === token);
  if (matchingReceipts.length === 0) {
    return res.status(404).json({ success: false, message: `Allocated Link "${token}" not found.` });
  }

  if (deleteReceipts) {
    // Delete all receipts that belonged to this link
    receipts = receipts.filter(r => !r.trackingToken || r.trackingToken.trim() !== token);
  } else {
    // Unlink receipts (keep as warehouse receipts)
    receipts.forEach(r => {
      if (r.trackingToken && r.trackingToken.trim() === token) {
        r.trackingToken = null;
        r.updatedAt = new Date().toISOString();
      }
    });
  }

  saveReceipts(receipts);
  res.json({
    success: true,
    message: deleteReceipts
      ? `Allocated Link "${token}" and its ${matchingReceipts.length} receipt(s) were deleted.`
      : `Allocated Link "${token}" removed. ${matchingReceipts.length} receipt(s) kept as unlinked warehouse receipts.`
  });
});

// Admin API: Bulk delete one or more Allocated Link Names
app.post('/api/admin/links/bulk-delete', (req, res) => {
  const { tokens, deleteReceipts } = req.body;
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ success: false, message: 'Tokens array is required.' });
  }

  const cleanTokens = tokens.map(t => (t || '').trim());
  let receipts = getReceipts();

  if (deleteReceipts) {
    // Delete receipts that match any of the tokens
    receipts = receipts.filter(r => !r.trackingToken || !cleanTokens.includes(r.trackingToken.trim()));
  } else {
    // Unlink receipts
    receipts.forEach(r => {
      if (r.trackingToken && cleanTokens.includes(r.trackingToken.trim())) {
        r.trackingToken = null;
        r.updatedAt = new Date().toISOString();
      }
    });
  }

  saveReceipts(receipts);
  res.json({
    success: true,
    message: `Successfully deleted ${cleanTokens.length} Allocated Link(s).`,
    deletedCount: cleanTokens.length
  });
});

// Fallback home redirect to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`Sample Tracking: http://localhost:${PORT}/track/trk_alpha789`);
});
