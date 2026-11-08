let allReceipts = [];
let allLinks = [];
let currentMainTab = 'links'; // 'links' or 'receipts'

// Selection sets
let selectedLinkTokens = new Set();
let selectedReceiptIds = new Set();
let expandedLinks = new Set(); // Stores tokens of currently expanded links
let linkReceiptSelection = {}; // Map of token -> Set of selected receipt IDs within that link

// Filtering and sorting state
let linksSearchQuery = '';
let linksSortColumn = 'date';
let linksSortDirection = 'desc';

let currentAdminFilter = 'all';
let adminSearchQuery = '';
let currentAdminSortColumn = 'date';
let currentAdminSortDirection = 'desc';

// Target for delete link modal
let pendingDeleteTokens = [];

function showToast(message, icon = '📋') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.innerText = message;
  toastIcon.innerText = icon;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

function copyTrackingLink(token) {
  const trackingUrl = `${window.location.origin}/track/${token}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(trackingUrl).then(() => {
      showToast('Tracking link copied to clipboard!');
    }).catch(() => {
      promptCopyFallback(trackingUrl);
    });
  } else {
    promptCopyFallback(trackingUrl);
  }
}

function promptCopyFallback(url) {
  window.prompt('Copy tracking link:', url);
}

function openTrackingLink(token) {
  window.open(`/track/${token}`, '_blank');
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getRemainDaysBadge(r) {
  if (r.status === 'delivered') {
    const dStr = r.deliveryDate ? formatDisplayDate(r.deliveryDate) : 'Delivered';
    return `<span class="badge badge-delivered">✅ Delivered (${dStr})</span>`;
  }

  if (r.status === 'in_warehouse' && !r.eta) {
    return `<span class="badge badge-warehouse">🏢 In Warehouse</span>`;
  }

  const remainDays = r.remainDays;
  if (remainDays === null || remainDays === undefined) {
    return `<span class="badge badge-warning">Pending</span>`;
  }
  if (remainDays > 1) {
    return `<span class="badge badge-info">⏳ ${remainDays} days</span>`;
  } else if (remainDays === 1) {
    return `<span class="badge badge-info">⚡ Tomorrow</span>`;
  } else if (remainDays === 0) {
    return `<span class="badge badge-success">📦 Today</span>`;
  } else {
    return `<span class="badge badge-danger">Passed (${Math.abs(remainDays)}d)</span>`;
  }
}

function getStatusBadge(status) {
  if (status === 'delivered') {
    return `<span class="badge badge-delivered">✅ Delivered</span>`;
  } else if (status === 'in_warehouse') {
    return `<span class="badge badge-warehouse">🏢 In Warehouse</span>`;
  } else {
    return `<span class="badge badge-transit">🚢 In Transit</span>`;
  }
}

// Tab Switching
function switchMainTab(tab) {
  currentMainTab = tab;
  document.getElementById('navTabLinks').classList.toggle('active', tab === 'links');
  document.getElementById('navTabReceipts').classList.toggle('active', tab === 'receipts');

  document.getElementById('viewLinksManager').style.display = tab === 'links' ? 'block' : 'none';
  document.getElementById('viewReceiptsInventory').style.display = tab === 'receipts' ? 'block' : 'none';

  if (tab === 'links') {
    renderLinksTable();
  } else {
    applyAdminFilterAndSort();
  }
}

// Master Data Loader
async function loadAllData() {
  await Promise.all([loadReceiptsData(), loadLinksData()]);
  updateOverallStatistics();
}

async function loadReceiptsData() {
  try {
    const res = await fetch('/api/admin/receipts');
    const data = await res.json();
    if (data.success) {
      allReceipts = data.receipts || [];
      document.getElementById('badgeReceiptsCount').innerText = allReceipts.length;
      updateTabCounts();
      applyAdminFilterAndSort();
      loadExistingTokens();
    }
  } catch (err) {
    console.error('Error fetching receipts:', err);
  }
}

async function loadLinksData() {
  try {
    const res = await fetch('/api/admin/links');
    const data = await res.json();
    if (data.success) {
      allLinks = data.links || [];
      document.getElementById('badgeLinksCount').innerText = allLinks.length;
      renderLinksTable();
    }
  } catch (err) {
    console.error('Error fetching links:', err);
  }
}

// Statistics Overview
function updateOverallStatistics() {
  // Exact requested statistics: how much deliver, how much in transit, how much in warehouse
  const inTransitCount = allReceipts.filter(r => r.status === 'in_transit').length;
  const inWarehouseCount = allReceipts.filter(r => r.status === 'in_warehouse').length;
  const deliveredCount = allReceipts.filter(r => r.status === 'delivered').length;
  const totalReceipts = allReceipts.length;
  const totalLinks = allLinks.length;

  document.getElementById('statInTransit').innerText = inTransitCount;
  document.getElementById('statWarehouseReceipts').innerText = inWarehouseCount;
  document.getElementById('statDelivered').innerText = deliveredCount;
  document.getElementById('statTotalLinks').innerText = totalLinks;
  document.getElementById('statTotalReceipts').innerText = totalReceipts;
}

// =======================================================
// VIEW 1: PUBLIC ETA TRACKING LINKS MANAGER
// =======================================================

function handleLinksSearch() {
  linksSearchQuery = document.getElementById('linksSearchInput').value.trim().toLowerCase();
  renderLinksTable();
}

function handleLinksSort(column) {
  if (linksSortColumn === column) {
    linksSortDirection = linksSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    linksSortColumn = column;
    linksSortDirection = (column === 'date' || column === 'receiptCount') ? 'desc' : 'asc';
  }
  updateLinksSortIndicators();
  renderLinksTable();
}

function updateLinksSortIndicators() {
  const cols = ['token', 'receiptCount', 'date'];
  cols.forEach(col => {
    const arrow = document.getElementById(`link_sort_${col}`);
    const th = arrow ? arrow.parentElement : null;
    if (col === linksSortColumn) {
      if (arrow) arrow.innerText = linksSortDirection === 'asc' ? '▲' : '▼';
      if (th) {
        th.classList.remove('sorted-asc', 'sorted-desc');
        th.classList.add(linksSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    } else {
      if (arrow) arrow.innerText = '↕';
      if (th) th.classList.remove('sorted-asc', 'sorted-desc');
    }
  });
}

function getFilteredLinks() {
  let list = allLinks.slice();

  if (linksSearchQuery) {
    list = list.filter(l => {
      const matchToken = l.token && l.token.toLowerCase().includes(linksSearchQuery);
      const matchReceipt = l.receipts && l.receipts.some(r =>
        (r.receiptNo && r.receiptNo.toLowerCase().includes(linksSearchQuery)) ||
        (r.itemName && r.itemName.toLowerCase().includes(linksSearchQuery)) ||
        (r.containerNo && r.containerNo.toLowerCase().includes(linksSearchQuery)) ||
        (r.status && r.status.toLowerCase().includes(linksSearchQuery))
      );
      return matchToken || matchReceipt;
    });
  }

  // Sort
  list.sort((a, b) => {
    let valA, valB;
    if (linksSortColumn === 'date') {
      valA = a.maxEta || a.minEta || '';
      valB = b.maxEta || b.minEta || '';
    } else if (linksSortColumn === 'receiptCount') {
      valA = a.receiptCount || 0;
      valB = b.receiptCount || 0;
      return linksSortDirection === 'asc' ? valA - valB : valB - valA;
    } else {
      valA = (a.token || '').toLowerCase();
      valB = (b.token || '').toLowerCase();
    }

    if (valA < valB) return linksSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return linksSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return list;
}

function toggleExpandLink(token) {
  if (expandedLinks.has(token)) {
    expandedLinks.delete(token);
  } else {
    expandedLinks.add(token);
  }
  renderLinksTable();
}

function toggleSelectLink(token, checked) {
  if (checked) {
    selectedLinkTokens.add(token);
  } else {
    selectedLinkTokens.delete(token);
  }
  updateLinksBulkBar();
}

function toggleSelectAllLinks(masterCheckbox) {
  const visible = getFilteredLinks();
  if (masterCheckbox.checked) {
    visible.forEach(l => selectedLinkTokens.add(l.token));
  } else {
    visible.forEach(l => selectedLinkTokens.delete(l.token));
  }
  updateLinksBulkBar();
  renderLinksTable();
}

function clearLinksSelection() {
  selectedLinkTokens.clear();
  const master = document.getElementById('selectAllLinksCheckbox');
  if (master) master.checked = false;
  updateLinksBulkBar();
  renderLinksTable();
}

function updateLinksBulkBar() {
  const bar = document.getElementById('linksBulkBar');
  const count = selectedLinkTokens.size;
  if (count > 0) {
    bar.style.display = 'flex';
    document.getElementById('linksBulkCountText').innerText = `${count} Allocated Link(s) selected`;
  } else {
    bar.style.display = 'none';
  }
}

function renderLinksTable() {
  const tbody = document.getElementById('linksTableBody');
  const filteredLinks = getFilteredLinks();

  if (filteredLinks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">
          No Allocated Tracking Links found. Click <strong>"Add New Receipt"</strong> to create one.
        </td>
      </tr>
    `;
    document.getElementById('linksTableSummary').innerText = '0 Allocated Links';
    updateLinksBulkBar();
    return;
  }

  let html = '';
  filteredLinks.forEach((link, idx) => {
    const isExpanded = expandedLinks.has(link.token);
    const isChecked = selectedLinkTokens.has(link.token);

    // ETA display range
    let etaDisplay = '-';
    if (link.minEta && link.maxEta) {
      if (link.minEta === link.maxEta) {
        etaDisplay = `<strong>${formatDisplayDate(link.minEta)}</strong>`;
      } else {
        etaDisplay = `<strong>${formatDisplayDate(link.minEta)}</strong> to <strong>${formatDisplayDate(link.maxEta)}</strong>`;
      }
    } else if (link.minEta) {
      etaDisplay = `<strong>${formatDisplayDate(link.minEta)}</strong>`;
    }

    // Cargo summary
    const cargoDisplay = `${link.totalCbm.toFixed(2)} m³ • ${link.totalCtn} ctn • ${link.totalWeight} kg`;

    // Status breakdown pills
    const statusPills = `
      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
        ${link.activeCount > 0 ? `<span class="stat-pill stat-pill-transit">🚢 ${link.activeCount} Transit</span>` : ''}
        ${link.warehouseCount > 0 ? `<span class="stat-pill stat-pill-warehouse">🏢 ${link.warehouseCount} Warehouse</span>` : ''}
        ${link.deliveredCount > 0 ? `<span class="stat-pill stat-pill-delivered">✅ ${link.deliveredCount} Delivered</span>` : ''}
      </div>
    `;

    // Main Allocated Link Row
    html += `
      <tr style="${isChecked ? 'background-color: #f0f7ff;' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectLink('${link.token}', this.checked)">
        </td>
        <td style="text-align: center; color: #94a3b8; font-size: 0.8rem;">
          ${idx + 1}
        </td>
        <td>
          <button 
            type="button" 
            class="allocated-link-btn" 
            onclick="toggleExpandLink('${link.token}')" 
            title="Click to view all data for this Allocated Link"
          >
            <span class="expand-chevron ${isExpanded ? 'open' : ''}">▶</span>
            <span>${link.token}</span>
            <span style="font-size: 0.72rem; color: #2563eb; background: #dbeafe; padding: 1px 6px; border-radius: 4px;">
              ${isExpanded ? '▲ Hide Data' : '▼ Click to View Data'}
            </span>
          </button>
        </td>
        <td>
          <span class="badge badge-info" style="font-size: 0.825rem; font-weight: 700;">
            📦 ${link.receiptCount} ${link.receiptCount === 1 ? 'Receipt' : 'Receipts'}
          </span>
        </td>
        <td>
          ${statusPills}
        </td>
        <td>
          <span style="font-size: 0.825rem; color: #334155; font-weight: 500;">
            ${cargoDisplay}
          </span>
        </td>
        <td>
          ${etaDisplay}
        </td>
        <td>
          <div class="link-cell">
            <button class="btn btn-secondary btn-sm" onclick="copyTrackingLink('${link.token}')" title="Copy public link">
              📋 Copy
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openTrackingLink('${link.token}')" title="View customer tracking page">
              👁️ View
            </button>
          </div>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="openAddReceiptUnderLink('${link.token}')" title="Add new receipt under this link">
            ➕ Add
          </button>
          <button class="btn btn-danger btn-sm" onclick="promptSingleDeleteLink('${link.token}')" title="Delete this Allocated Link">
            🗑️ Delete Link
          </button>
        </td>
      </tr>
    `;

    // Nested Sub-table Row (Shown when Expanded!)
    if (isExpanded) {
      html += renderExpandedLinkSection(link);
    }
  });

  tbody.innerHTML = html;
  document.getElementById('linksTableSummary').innerText = `Showing ${filteredLinks.length} of ${allLinks.length} Allocated Links`;
  updateLinksBulkBar();
}

// Render the Expanded Sub-section showing all receipt data under that Allocated Link
function renderExpandedLinkSection(link) {
  const token = link.token;
  if (!linkReceiptSelection[token]) {
    linkReceiptSelection[token] = new Set();
  }
  const selectedReceipts = linkReceiptSelection[token];
  const selectedCount = selectedReceipts.size;

  const receiptsRows = link.receipts.map(r => {
    const isChecked = selectedReceipts.has(r.id);

    let displayContainer = escapeHtml(r.containerNo || '-');
    if (r.status === 'in_warehouse' && (!r.containerNo || r.containerNo.toLowerCase().includes('warehouse'))) {
      displayContainer = `<span class="badge badge-warehouse">🏢 In Warehouse</span>`;
    } else {
      displayContainer = `<span style="font-family: monospace; font-weight: 600; color: #1e40af;">${displayContainer}</span>`;
    }

    let dateDisplay = '';
    if (r.status === 'delivered') {
      dateDisplay = `<span style="color: #166534; font-weight: 700;">✅ ${formatDisplayDate(r.deliveryDate)}</span>`;
    } else {
      dateDisplay = `<strong>${formatDisplayDate(r.eta)}</strong>`;
    }

    return `
      <tr style="${isChecked ? 'background-color: #f0f7ff;' : ''}">
        <td style="text-align: center;">
          <input 
            type="checkbox" 
            ${isChecked ? 'checked' : ''} 
            onchange="toggleSelectLinkReceipt('${token}', '${r.id}', this.checked)"
          >
        </td>
        <td>
          <strong style="color: #0f172a; font-size: 0.925rem;">${escapeHtml(r.receiptNo)}</strong>
        </td>
        <td>
          <div style="font-weight: 600; color: #1e293b;">${escapeHtml(r.itemName || '-')}</div>
        </td>
        <td>
          <span style="font-size: 0.8rem; color: #475569;">
            ${r.cbm ? r.cbm + ' m³' : '-'} / ${r.ctn ? r.ctn + ' ctn' : '-'} / ${r.weight || '-'}
          </span>
        </td>
        <td>
          ${displayContainer}
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.775rem; color: #64748b;">
            ${escapeHtml(r.actualContainerNo || '(none)')}
          </span>
        </td>
        <td>
          ${getStatusBadge(r.status)}
        </td>
        <td>
          ${dateDisplay}
        </td>
        <td>
          ${getRemainDaysBadge(r)}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${r.id}')" title="Edit Receipt">
            ✏️
          </button>
          <button class="btn btn-secondary btn-sm" onclick="unlinkSingleReceiptFromManager('${r.id}', '${escapeHtml(r.receiptNo)}')" title="Remove from this link">
            ❌ Remove
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteReceiptFromManager('${r.id}', '${escapeHtml(r.receiptNo)}')" title="Delete this receipt">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <tr class="expanded-content-row">
      <td colspan="9" style="padding: 0; background-color: #f8fafc;">
        <div class="nested-receipts-card">

          <!-- Section Toolbar for this Link -->
          <div class="nested-toolbar">
            <div class="nested-toolbar-title">
              <span>📦 All Receipts under Allocated Link:</span>
              <span style="font-family: monospace; color: #2563eb; background: #eff6ff; padding: 2px 8px; border-radius: 4px; border: 1px solid #bfdbfe;">
                ${token}
              </span>
              <span style="font-size: 0.8rem; color: #64748b; margin-left: 6px;">
                (${link.receiptCount} ${link.receiptCount === 1 ? 'receipt' : 'receipts'})
              </span>
            </div>

            <!-- Multi-select & Bulk Actions for receipts inside this link -->
            <div class="nested-toolbar-actions">
              ${selectedCount > 0 ? `
                <span style="font-size: 0.85rem; font-weight: 700; color: #1e40af; margin-right: 6px;">
                  ☑️ ${selectedCount} selected
                </span>
                <button class="btn btn-danger btn-sm" onclick="bulkDeleteReceiptsFromLink('${token}')">
                  🗑️ Delete Selected Receipts (${selectedCount})
                </button>
                <button class="btn btn-secondary btn-sm" onclick="bulkUnlinkReceiptsFromLink('${token}')">
                  ❌ Remove Selected from Link
                </button>
              ` : ''}

              <button class="btn btn-secondary btn-sm" onclick="promptQuickUpdateLinkEta('${token}')">
                ⚡ Update ETA for All
              </button>
              <button class="btn btn-primary btn-sm" onclick="openAddReceiptUnderLink('${token}')">
                ➕ Add Receipt to this Link
              </button>
            </div>
          </div>

          <!-- Nested Receipts Table -->
          <div style="overflow-x: auto;">
            <table style="font-size: 0.85rem;">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="width: 34px; text-align: center;">
                    <input 
                      type="checkbox" 
                      ${selectedCount === link.receipts.length && link.receipts.length > 0 ? 'checked' : ''} 
                      onchange="toggleSelectAllLinkReceipts('${token}', this.checked)"
                      title="Select all receipts in this link"
                    >
                  </th>
                  <th>Receipt No.</th>
                  <th>Item Name</th>
                  <th>CBM / CTN / Weight</th>
                  <th>Container No. (Public)</th>
                  <th>Actual Container (Admin)</th>
                  <th>Status</th>
                  <th>ETA / Delivery Date</th>
                  <th>Remain Days</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${receiptsRows}
              </tbody>
            </table>
          </div>

        </div>
      </td>
    </tr>
  `;
}

// Receipt selection inside an expanded link section
function toggleSelectLinkReceipt(token, receiptId, checked) {
  if (!linkReceiptSelection[token]) {
    linkReceiptSelection[token] = new Set();
  }
  if (checked) {
    linkReceiptSelection[token].add(receiptId);
  } else {
    linkReceiptSelection[token].delete(receiptId);
  }
  renderLinksTable();
}

function toggleSelectAllLinkReceipts(token, checked) {
  const link = allLinks.find(l => l.token === token);
  if (!link) return;
  if (!linkReceiptSelection[token]) {
    linkReceiptSelection[token] = new Set();
  }

  if (checked) {
    link.receipts.forEach(r => linkReceiptSelection[token].add(r.id));
  } else {
    linkReceiptSelection[token].clear();
  }
  renderLinksTable();
}

// Bulk delete multiple receipts from link section
async function bulkDeleteReceiptsFromLink(token) {
  const selectedSet = linkReceiptSelection[token];
  if (!selectedSet || selectedSet.size === 0) return;

  const count = selectedSet.size;
  if (!confirm(`Are you sure you want to permanently delete ${count} receipt(s) from link "${token}"?`)) {
    return;
  }

  const ids = Array.from(selectedSet);
  try {
    const res = await fetch('/api/admin/receipts/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      linkReceiptSelection[token].clear();
      showToast(`Deleted ${result.deletedCount} receipt(s).`, '🗑️');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to delete receipts.');
    }
  } catch (err) {
    console.error('Error deleting receipts:', err);
    alert('Network error while deleting receipts.');
  }
}

// Bulk unlink multiple receipts from link section
async function bulkUnlinkReceiptsFromLink(token) {
  const selectedSet = linkReceiptSelection[token];
  if (!selectedSet || selectedSet.size === 0) return;

  const count = selectedSet.size;
  if (!confirm(`Remove ${count} receipt(s) from link "${token}"? They will become unlinked warehouse receipts.`)) {
    return;
  }

  const ids = Array.from(selectedSet);
  try {
    const res = await fetch('/api/admin/links/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bulk_unlink',
        receiptIds: ids
      })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      linkReceiptSelection[token].clear();
      showToast(result.message || 'Receipts removed from link.', '❌');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to remove receipts from link.');
    }
  } catch (err) {
    console.error('Error unlinking receipts:', err);
    alert('Network error while removing receipts.');
  }
}

// Single receipt remove/delete from Manager
async function unlinkSingleReceiptFromManager(receiptId, receiptNo) {
  if (!confirm(`Remove receipt "${receiptNo}" from this link? It will become an unlinked warehouse receipt.`)) {
    return;
  }

  try {
    const res = await fetch('/api/admin/links/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlink', receiptId })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showToast(result.message, '❌');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to remove receipt.');
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Network error.');
  }
}

async function deleteReceiptFromManager(receiptId, receiptNo) {
  if (!confirm(`Permanently delete receipt "${receiptNo}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/receipts/${receiptId}`, { method: 'DELETE' });
    const result = await res.json();

    if (res.ok && result.success) {
      showToast(`Receipt ${receiptNo} deleted.`, '🗑️');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to delete receipt.');
    }
  } catch (err) {
    console.error('Error deleting receipt:', err);
    alert('Network error.');
  }
}

// Quick Update ETA for all receipts in an Allocated Link
async function promptQuickUpdateLinkEta(token) {
  const newEta = prompt(`Enter new ETA (YYYY-MM-DD) for all receipts under link "${token}":`);
  if (!newEta || !newEta.trim()) return;

  try {
    const res = await fetch('/api/admin/links/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_link_eta',
        token: token,
        eta: newEta.trim()
      })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showToast(result.message || 'ETA updated for all receipts in this link!', '⚡');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to update ETA.');
    }
  } catch (err) {
    console.error('Error updating ETA:', err);
    alert('Network error.');
  }
}

function openAddReceiptUnderLink(token) {
  openAddReceiptModal();
  const optExisting = document.querySelector('input[name="tokenOption"][value="existing"]');
  if (optExisting) {
    optExisting.checked = true;
    toggleTokenOption();
  }
  const select = document.getElementById('existingTokenSelect');
  if (select) {
    select.value = token;
  }
}

// =======================================================
// DELETING ALLOCATED LINK NAMES (Single or Multiple)
// =======================================================

function promptSingleDeleteLink(token) {
  pendingDeleteTokens = [token];
  document.getElementById('deleteLinkNamesList').innerText = token;
  document.getElementById('deleteLinkModal').classList.add('active');
}

function promptBulkDeleteLinks() {
  if (selectedLinkTokens.size === 0) {
    alert('Please select at least one Allocated Link to delete.');
    return;
  }
  pendingDeleteTokens = Array.from(selectedLinkTokens);
  document.getElementById('deleteLinkNamesList').innerText = pendingDeleteTokens.join(', ');
  document.getElementById('deleteLinkModal').classList.add('active');
}

function closeDeleteLinkModal() {
  document.getElementById('deleteLinkModal').classList.remove('active');
  pendingDeleteTokens = [];
}

async function confirmExecuteDeleteLinks() {
  if (pendingDeleteTokens.length === 0) return;

  const mode = document.querySelector('input[name="deleteLinkReceiptsMode"]:checked').value;
  const deleteReceipts = mode === 'delete';

  const btn = document.getElementById('confirmDeleteLinkBtn');
  btn.disabled = true;
  btn.innerText = 'Deleting...';

  try {
    const res = await fetch('/api/admin/links/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens: pendingDeleteTokens,
        deleteReceipts: deleteReceipts
      })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      closeDeleteLinkModal();
      clearLinksSelection();
      showToast(result.message || 'Allocated Link(s) deleted successfully.', '🗑️');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to delete Allocated Link(s).');
    }
  } catch (err) {
    console.error('Error deleting links:', err);
    alert('Network error while deleting links.');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Confirm Delete';
  }
}

// =======================================================
// VIEW 2: ALL RECEIPTS INVENTORY (Flat table)
// =======================================================

function updateTabCounts() {
  const total = allReceipts.length;
  const active = allReceipts.filter(r => r.status !== 'delivered').length;
  const warehouse = allReceipts.filter(r => r.status === 'in_warehouse').length;
  const transit = allReceipts.filter(r => r.status === 'in_transit').length;
  const delivered = allReceipts.filter(r => r.status === 'delivered').length;

  document.getElementById('tabCountAll').innerText = total;
  document.getElementById('tabCountActive').innerText = active;
  document.getElementById('tabCountWarehouse').innerText = warehouse;
  document.getElementById('tabCountTransit').innerText = transit;
  document.getElementById('tabCountDelivered').innerText = delivered;
}

function setAdminFilter(filter) {
  currentAdminFilter = filter;

  document.getElementById('filterTabAll').classList.toggle('active', filter === 'all');
  document.getElementById('filterTabActive').classList.toggle('active', filter === 'active');
  document.getElementById('filterTabWarehouse').classList.toggle('active', filter === 'in_warehouse');
  document.getElementById('filterTabTransit').classList.toggle('active', filter === 'in_transit');
  document.getElementById('filterTabDelivered').classList.toggle('active', filter === 'delivered');

  applyAdminFilterAndSort();
}

function handleSearch() {
  adminSearchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
  applyAdminFilterAndSort();
}

function handleAdminSort(column) {
  if (currentAdminSortColumn === column) {
    currentAdminSortDirection = currentAdminSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentAdminSortColumn = column;
    currentAdminSortDirection = (column === 'date' || column === 'remainDays') ? 'desc' : 'asc';
  }
  updateAdminSortIndicators();
  applyAdminFilterAndSort();
}

function updateAdminSortIndicators() {
  const cols = ['receiptNo', 'itemName', 'status', 'containerNo', 'date', 'remainDays'];
  cols.forEach(col => {
    const arrow = document.getElementById(`admin_sort_${col}`);
    const th = arrow ? arrow.parentElement : null;
    if (col === currentAdminSortColumn) {
      if (arrow) arrow.innerText = currentAdminSortDirection === 'asc' ? '▲' : '▼';
      if (th) {
        th.classList.remove('sorted-asc', 'sorted-desc');
        th.classList.add(currentAdminSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    } else {
      if (arrow) arrow.innerText = '↕';
      if (th) th.classList.remove('sorted-asc', 'sorted-desc');
    }
  });
}

function getFilteredReceipts() {
  let list = allReceipts.filter(r => {
    if (currentAdminFilter === 'active') {
      return r.status !== 'delivered';
    } else if (currentAdminFilter === 'in_warehouse') {
      return r.status === 'in_warehouse';
    } else if (currentAdminFilter === 'in_transit') {
      return r.status === 'in_transit';
    } else if (currentAdminFilter === 'delivered') {
      return r.status === 'delivered';
    }
    return true;
  });

  if (adminSearchQuery) {
    list = list.filter(r => 
      (r.receiptNo && r.receiptNo.toLowerCase().includes(adminSearchQuery)) ||
      (r.itemName && r.itemName.toLowerCase().includes(adminSearchQuery)) ||
      (r.containerNo && r.containerNo.toLowerCase().includes(adminSearchQuery)) ||
      (r.actualContainerNo && r.actualContainerNo.toLowerCase().includes(adminSearchQuery)) ||
      (r.trackingToken && r.trackingToken.toLowerCase().includes(adminSearchQuery)) ||
      (r.status && r.status.toLowerCase().includes(adminSearchQuery))
    );
  }

  // Sort
  list.sort((a, b) => {
    let valA, valB;

    if (currentAdminSortColumn === 'date') {
      valA = a.deliveryDate || a.eta || '';
      valB = b.deliveryDate || b.eta || '';
    } else if (currentAdminSortColumn === 'remainDays') {
      valA = a.remainDays !== null && a.remainDays !== undefined ? a.remainDays : -999999;
      valB = b.remainDays !== null && b.remainDays !== undefined ? b.remainDays : -999999;
      return currentAdminSortDirection === 'asc' ? valA - valB : valB - valA;
    } else {
      valA = (a[currentAdminSortColumn] || '').toString().toLowerCase();
      valB = (b[currentAdminSortColumn] || '').toString().toLowerCase();
    }

    if (valA < valB) return currentAdminSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return currentAdminSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return list;
}

function applyAdminFilterAndSort() {
  const filtered = getFilteredReceipts();
  renderAdminTable(filtered);

  const summary = document.getElementById('adminTableSummary');
  if (summary) {
    const colName = currentAdminSortColumn === 'date' ? 'Date (Delivery/ETA)' : currentAdminSortColumn;
    const dirName = currentAdminSortDirection === 'desc' ? 'newest first' : 'ascending';
    summary.innerText = `Showing ${filtered.length} of ${allReceipts.length} receipts • Sorted by ${colName} (${dirName})`;
  }
}

function renderAdminTable(receipts) {
  const tbody = document.getElementById('receiptsTableBody');

  if (receipts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 40px; color: #64748b;">
          No receipts found matching your criteria.
        </td>
      </tr>
    `;
    updateBulkBar();
    return;
  }

  tbody.innerHTML = receipts.map(r => {
    const isChecked = selectedReceiptIds.has(r.id);

    let dateDisplay = '';
    if (r.status === 'delivered') {
      dateDisplay = `<strong style="color: #166534;">✅ ${formatDisplayDate(r.deliveryDate)}</strong><br><span style="font-size: 0.72rem; color: #64748b;">Delivered</span>`;
    } else {
      dateDisplay = `<strong>${formatDisplayDate(r.eta)}</strong><br><span style="font-size: 0.72rem; color: #64748b;">ETA</span>`;
    }

    let linkCell = '';
    if (r.trackingToken && r.trackingToken.trim()) {
      linkCell = `
        <div class="link-cell">
          <span class="quick-token-badge" title="Token: ${r.trackingToken}">${r.trackingToken}</span>
          <button class="btn btn-secondary btn-sm" onclick="copyTrackingLink('${r.trackingToken}')" title="Copy tracking link">
            📋
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openTrackingLink('${r.trackingToken}')" title="View customer tracking page">
            👁️
          </button>
          <button class="btn btn-danger btn-sm" onclick="unlinkSingleReceipt('${r.id}', '${escapeHtml(r.receiptNo)}')" title="Remove from this link">
            ❌
          </button>
        </div>
      `;
    } else {
      linkCell = `
        <div class="link-cell">
          <span class="badge badge-unlinked">⚪ Unlinked (Warehouse)</span>
          <button class="btn btn-secondary btn-sm" onclick="promptLinkSingleReceipt('${r.id}', '${escapeHtml(r.receiptNo)}')" title="Attach to ETA tracking link">
            🔗 Link
          </button>
        </div>
      `;
    }

    let displayContainer = escapeHtml(r.containerNo || '-');
    if (r.status === 'in_warehouse' && (!r.containerNo || r.containerNo.toLowerCase().includes('warehouse'))) {
      displayContainer = `<span class="badge badge-warehouse">🏢 In Warehouse</span>`;
    } else {
      displayContainer = `<span style="font-family: monospace; font-weight: 600; color: #1e40af;">${displayContainer}</span>`;
    }

    return `
      <tr style="${isChecked ? 'background-color: #f0f7ff;' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectReceipt('${r.id}', this.checked)">
        </td>
        <td>
          <strong style="color: #0f172a; font-size: 0.95rem;">${escapeHtml(r.receiptNo)}</strong>
        </td>
        <td>
          <div style="font-weight: 600; color: #1e293b;">${escapeHtml(r.itemName || '-')}</div>
        </td>
        <td>
          ${getStatusBadge(r.status)}
        </td>
        <td>
          <span style="font-size: 0.825rem; color: #475569;">
            ${r.cbm ? r.cbm + ' m³' : '-'} / ${r.ctn ? r.ctn + ' ctn' : '-'} / ${r.weight || '-'}
          </span>
        </td>
        <td>
          ${displayContainer}
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.8rem; color: #64748b;">
            ${escapeHtml(r.actualContainerNo || '(none)')}
          </span>
        </td>
        <td>
          ${dateDisplay}
        </td>
        <td>
          ${getRemainDaysBadge(r)}
        </td>
        <td>
          ${linkCell}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${r.id}')" title="Edit details & ETA">
            ✏️ Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteReceipt('${r.id}', '${escapeHtml(r.receiptNo)}')" title="Delete receipt">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');

  updateBulkBar();
}

// Flat Receipts Selection & Bulk Actions
function toggleSelectReceipt(id, checked) {
  if (checked) {
    selectedReceiptIds.add(id);
  } else {
    selectedReceiptIds.delete(id);
  }
  updateBulkBar();
  applyAdminFilterAndSort();
}

function toggleSelectAll(masterCheckbox) {
  const visible = getFilteredReceipts();
  if (masterCheckbox.checked) {
    visible.forEach(r => selectedReceiptIds.add(r.id));
  } else {
    visible.forEach(r => selectedReceiptIds.delete(r.id));
  }
  updateBulkBar();
  applyAdminFilterAndSort();
}

function clearSelection() {
  selectedReceiptIds.clear();
  const master = document.getElementById('selectAllCheckbox');
  if (master) master.checked = false;
  updateBulkBar();
  applyAdminFilterAndSort();
}

function updateBulkBar() {
  const bulkBar = document.getElementById('bulkBar');
  const countText = document.getElementById('bulkCountText');
  const count = selectedReceiptIds.size;

  if (count > 0) {
    bulkBar.style.display = 'flex';
    countText.innerText = `${count} receipt${count === 1 ? '' : 's'} selected`;
  } else {
    bulkBar.style.display = 'none';
  }
}

// Bulk delete multiple receipts from flat view
async function bulkDeleteSelectedReceipts() {
  if (selectedReceiptIds.size === 0) return;

  const count = selectedReceiptIds.size;
  if (!confirm(`Are you sure you want to permanently delete ${count} selected receipt(s)?`)) {
    return;
  }

  const ids = Array.from(selectedReceiptIds);
  try {
    const res = await fetch('/api/admin/receipts/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      clearSelection();
      showToast(`Deleted ${result.deletedCount} receipt(s).`, '🗑️');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to delete receipts.');
    }
  } catch (err) {
    console.error('Error deleting receipts:', err);
    alert('Network error while deleting receipts.');
  }
}

// Bulk update modal
function openBulkUpdateModal() {
  if (selectedReceiptIds.size === 0) {
    alert('Please select at least one receipt first.');
    return;
  }
  document.getElementById('bulkModalCount').innerText = selectedReceiptIds.size;
  document.getElementById('bulkEta').value = '';
  document.getElementById('bulkStatus').value = '';
  document.getElementById('bulkDeliveryDate').value = '';
  document.getElementById('bulkContainerNo').value = '';
  toggleBulkStatusFields();
  document.getElementById('bulkModal').classList.add('active');
}

function closeBulkModal() {
  document.getElementById('bulkModal').classList.remove('active');
}

function toggleBulkStatusFields() {
  const status = document.getElementById('bulkStatus').value;
  const delGroup = document.getElementById('bulkDeliveryDateGroup');
  if (status === 'delivered') {
    delGroup.style.display = 'block';
    if (!document.getElementById('bulkDeliveryDate').value) {
      document.getElementById('bulkDeliveryDate').value = new Date().toISOString().split('T')[0];
    }
  } else {
    delGroup.style.display = 'none';
  }
}

async function submitBulkUpdate(e) {
  e.preventDefault();
  const ids = Array.from(selectedReceiptIds);
  const etaVal = document.getElementById('bulkEta').value;
  const statusVal = document.getElementById('bulkStatus').value;
  const deliveryDateVal = document.getElementById('bulkDeliveryDate').value;
  const containerNoVal = document.getElementById('bulkContainerNo').value;

  const payload = { ids };
  if (etaVal) payload.eta = etaVal;
  if (statusVal) {
    payload.status = statusVal;
    if (statusVal === 'delivered') payload.deliveryDate = deliveryDateVal;
  }
  if (containerNoVal && containerNoVal.trim()) {
    payload.containerNo = containerNoVal.trim();
  }

  const btn = document.getElementById('saveBulkBtn');
  btn.disabled = true;
  btn.innerText = 'Updating...';

  try {
    const res = await fetch('/api/admin/receipts/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (res.ok && result.success) {
      closeBulkModal();
      clearSelection();
      showToast(result.message || 'Receipts updated in bulk!', '⚡');
      await loadAllData();
    } else {
      alert(result.message || 'Bulk update failed.');
    }
  } catch (err) {
    console.error('Error in bulk update:', err);
    alert('Network error during bulk update.');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Apply Bulk Update';
  }
}

// Bulk link modal
function openBulkLinkModal() {
  if (selectedReceiptIds.size === 0) {
    alert('Please select at least one receipt first.');
    return;
  }

  const selectedList = allReceipts.filter(r => selectedReceiptIds.has(r.id));
  const alreadyLinked = selectedList.filter(r => r.trackingToken && r.trackingToken.trim());
  if (alreadyLinked.length > 0) {
    const names = alreadyLinked.map(r => `${r.receiptNo} (${r.trackingToken})`).join(', ');
    alert(`Cannot link: The following receipt(s) are already linked to an ETA link:\n${names}\n\nRule: If any receipt is linked to a link, it cannot be linked again. You must remove it from its existing link first.`);
    return;
  }

  document.getElementById('bulkLinkModalCount').innerText = selectedReceiptIds.size;
  loadExistingTokens();
  toggleBulkLinkOption();
  document.getElementById('bulkLinkModal').classList.add('active');
}

function closeBulkLinkModal() {
  document.getElementById('bulkLinkModal').classList.remove('active');
}

function toggleBulkLinkOption() {
  const val = document.querySelector('input[name="bulkLinkOption"]:checked').value;
  document.getElementById('bulkExistingLinkContainer').style.display = val === 'existing' ? 'block' : 'none';
}

async function submitBulkLink() {
  const option = document.querySelector('input[name="bulkLinkOption"]:checked').value;
  let targetToken = '';

  if (option === 'existing') {
    targetToken = document.getElementById('bulkExistingLinkSelect').value;
    if (!targetToken) {
      alert('Please select an existing tracking link.');
      return;
    }
  } else {
    targetToken = 'trk_' + Math.random().toString(36).substring(2, 10);
  }

  const payload = {
    action: 'link_receipts',
    token: targetToken,
    receiptIds: Array.from(selectedReceiptIds)
  };

  try {
    const res = await fetch('/api/admin/links/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (res.ok && result.success) {
      closeBulkLinkModal();
      clearSelection();
      showToast(result.message || 'Receipts linked successfully!', '🔗');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to link receipts.');
    }
  } catch (err) {
    console.error('Error linking receipts:', err);
    alert('Network error while linking receipts.');
  }
}

// Bulk Unlink
async function bulkUnlinkSelected() {
  if (selectedReceiptIds.size === 0) return;

  const count = selectedReceiptIds.size;
  if (!confirm(`Are you sure you want to remove ${count} receipt(s) from their tracking links? They will become unlinked warehouse receipts.`)) {
    return;
  }

  try {
    const res = await fetch('/api/admin/links/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bulk_unlink',
        receiptIds: Array.from(selectedReceiptIds)
      })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      clearSelection();
      showToast(result.message || 'Receipts unlinked successfully.', '❌');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to unlink receipts.');
    }
  } catch (err) {
    console.error('Error unlinking:', err);
    alert('Network error while unlinking receipts.');
  }
}

// Single Unlink
async function unlinkSingleReceipt(receiptId, receiptNo) {
  if (!confirm(`Remove receipt "${receiptNo}" from its tracking link? It will become an unlinked warehouse receipt.`)) {
    return;
  }

  try {
    const res = await fetch('/api/admin/links/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlink', receiptId })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showToast(result.message, '❌');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to remove receipt from link.');
    }
  } catch (err) {
    console.error('Error unlinking receipt:', err);
    alert('Network error.');
  }
}

async function promptLinkSingleReceipt(receiptId, receiptNo) {
  selectedReceiptIds.clear();
  selectedReceiptIds.add(receiptId);
  openBulkLinkModal();
}

// Status change handler
function handleStatusChange(type) {
  const statusEl = document.getElementById(type === 'add' ? 'addStatus' : 'editStatus');
  const status = statusEl.value;

  if (type === 'add') {
    const helper = document.getElementById('addStatusHelper');
    const containerInput = document.getElementById('containerNo');
    const labelContainer = document.getElementById('labelContainerNo');
    const groupEta = document.getElementById('groupEta');
    const labelEta = document.getElementById('labelEta');
    const groupDeliveryDate = document.getElementById('groupDeliveryDate');
    const deliveryInput = document.getElementById('deliveryDate');

    if (status === 'in_warehouse') {
      helper.innerText = '🏢 Receipt is stored in warehouse; not loaded into container yet.';
      labelContainer.innerHTML = 'Container No. <span style="font-size:0.75rem; color:#64748b;">(Optional for warehouse)</span>';
      containerInput.placeholder = 'e.g. In Warehouse (Not Loaded)';
      containerInput.required = false;
      labelEta.innerHTML = 'Estimated Time of Arrival <span style="font-size:0.75rem; color:#64748b;">(Optional)</span>';
      groupEta.style.display = 'block';
      groupDeliveryDate.style.display = 'none';
      deliveryInput.required = false;

      const optNone = document.querySelector('input[name="tokenOption"][value="none"]');
      if (optNone) {
        optNone.checked = true;
        toggleTokenOption();
      }
    } else if (status === 'delivered') {
      helper.innerText = '✅ Shipment has reached customer and is marked as delivered.';
      labelContainer.innerHTML = 'Container No. *';
      containerInput.required = true;
      groupEta.style.display = 'none';
      groupDeliveryDate.style.display = 'block';
      deliveryInput.required = true;
      if (!deliveryInput.value) {
        deliveryInput.value = new Date().toISOString().split('T')[0];
      }
    } else {
      helper.innerText = '🚢 Shipment is loaded to container and en-route to destination.';
      labelContainer.innerHTML = 'Container No. (not actual) *';
      containerInput.required = true;
      groupEta.style.display = 'block';
      labelEta.innerHTML = 'Estimated Time of Arrival (ETA) *';
      groupDeliveryDate.style.display = 'none';
      deliveryInput.required = false;

      const optNew = document.querySelector('input[name="tokenOption"][value="new"]');
      if (optNew) {
        optNew.checked = true;
        toggleTokenOption();
      }
    }
  } else if (type === 'edit') {
    const groupEta = document.getElementById('editGroupEta');
    const groupDel = document.getElementById('editGroupDeliveryDate');
    const delInput = document.getElementById('editDeliveryDate');

    if (status === 'delivered') {
      groupEta.style.display = 'none';
      groupDel.style.display = 'block';
      if (!delInput.value) {
        delInput.value = new Date().toISOString().split('T')[0];
      }
    } else {
      groupEta.style.display = 'block';
      groupDel.style.display = 'none';
    }
  }
}

function toggleTokenOption() {
  const selected = document.querySelector('input[name="tokenOption"]:checked').value;
  const container = document.getElementById('existingTokenContainer');
  if (selected === 'existing') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}

async function loadExistingTokens() {
  try {
    const res = await fetch('/api/admin/tokens');
    const data = await res.json();
    const select = document.getElementById('existingTokenSelect');
    const bulkSelect = document.getElementById('bulkExistingLinkSelect');

    const placeholder = '<option value="">-- Choose existing link --</option>';
    if (select) select.innerHTML = placeholder;
    if (bulkSelect) bulkSelect.innerHTML = placeholder;

    if (data.success && data.tokens) {
      data.tokens.forEach(item => {
        const option = document.createElement('option');
        option.value = item.token;
        option.textContent = `${item.token} (${item.receiptCount} receipts: ${item.receipts.slice(0, 3).join(', ')}${item.receipts.length > 3 ? '...' : ''})`;
        if (select) select.appendChild(option);
        if (bulkSelect) bulkSelect.appendChild(option.cloneNode(true));
      });
    }
  } catch (err) {
    console.error('Error loading tokens:', err);
  }
}

function openAddReceiptModal() {
  document.getElementById('addReceiptForm').reset();
  document.getElementById('addStatus').value = 'in_transit';
  handleStatusChange('add');
  toggleTokenOption();
  loadExistingTokens();
  document.getElementById('addModal').classList.add('active');
}

function closeAddReceiptModal() {
  document.getElementById('addModal').classList.remove('active');
}

async function submitAddReceipt(e) {
  e.preventDefault();
  const tokenOption = document.querySelector('input[name="tokenOption"]:checked').value;
  const existingToken = document.getElementById('existingTokenSelect').value;

  if (tokenOption === 'existing' && !existingToken) {
    alert('Please select an existing tracking link from the dropdown.');
    return;
  }

  const status = document.getElementById('addStatus').value;
  const payload = {
    receiptNo: document.getElementById('receiptNo').value,
    itemName: document.getElementById('itemName').value,
    cbm: document.getElementById('cbm').value,
    ctn: document.getElementById('ctn').value,
    weight: document.getElementById('weight').value,
    containerNo: document.getElementById('containerNo').value,
    actualContainerNo: document.getElementById('actualContainerNo').value,
    status: status,
    eta: document.getElementById('eta').value,
    deliveryDate: status === 'delivered' ? document.getElementById('deliveryDate').value : null,
    adminNotes: document.getElementById('adminNotes').value,
    trackingTokenOption: tokenOption,
    existingToken: existingToken
  };

  const saveBtn = document.getElementById('saveReceiptBtn');
  saveBtn.disabled = true;
  saveBtn.innerText = 'Saving...';

  try {
    const res = await fetch('/api/admin/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (res.ok && result.success) {
      closeAddReceiptModal();
      showToast(`Receipt ${result.receipt.receiptNo} created successfully!`, '✅');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to save receipt.');
    }
  } catch (err) {
    console.error('Error saving receipt:', err);
    alert('Network error while saving receipt.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = 'Save Receipt';
  }
}

function openEditModal(id) {
  const receipt = allReceipts.find(r => r.id === id);
  if (!receipt) return;

  document.getElementById('editId').value = receipt.id;
  document.getElementById('editReceiptNo').value = receipt.receiptNo || '';
  document.getElementById('editItemName').value = receipt.itemName || '';
  document.getElementById('editCbm').value = receipt.cbm || '';
  document.getElementById('editCtn').value = receipt.ctn || '';
  document.getElementById('editWeight').value = receipt.weight || '';
  document.getElementById('editContainerNo').value = receipt.containerNo || '';
  document.getElementById('editActualContainerNo').value = receipt.actualContainerNo || '';
  document.getElementById('editStatus').value = receipt.status || 'in_transit';
  document.getElementById('editEta').value = receipt.eta || '';
  document.getElementById('editDeliveryDate').value = receipt.deliveryDate || '';
  document.getElementById('editAdminNotes').value = receipt.adminNotes || '';

  handleStatusChange('edit');

  const tokenText = document.getElementById('editTokenStatusText');
  const tokenActions = document.getElementById('editTokenActions');

  if (receipt.trackingToken && receipt.trackingToken.trim()) {
    tokenText.innerHTML = `Linked to: <span style="font-family: monospace; color: #2563eb;">${receipt.trackingToken}</span>`;
    tokenActions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="copyTrackingLink('${receipt.trackingToken}')">📋 Copy</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="openTrackingLink('${receipt.trackingToken}')">👁️ View</button>
      <button type="button" class="btn btn-danger btn-sm" onclick="unlinkSingleReceipt('${receipt.id}', '${escapeHtml(receipt.receiptNo)}'); closeEditModal();">❌ Unlink</button>
    `;
  } else {
    tokenText.innerHTML = `<span class="badge badge-unlinked">⚪ Unlinked Warehouse Receipt</span>`;
    tokenActions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeEditModal(); promptLinkSingleReceipt('${receipt.id}', '${escapeHtml(receipt.receiptNo)}');">🔗 Link to ETA</button>
    `;
  }

  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
}

async function submitEditReceipt(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const status = document.getElementById('editStatus').value;

  const payload = {
    receiptNo: document.getElementById('editReceiptNo').value,
    itemName: document.getElementById('editItemName').value,
    cbm: document.getElementById('editCbm').value,
    ctn: document.getElementById('editCtn').value,
    weight: document.getElementById('editWeight').value,
    containerNo: document.getElementById('editContainerNo').value,
    actualContainerNo: document.getElementById('editActualContainerNo').value,
    status: status,
    eta: document.getElementById('editEta').value,
    deliveryDate: status === 'delivered' ? document.getElementById('editDeliveryDate').value : null,
    adminNotes: document.getElementById('editAdminNotes').value
  };

  const saveBtn = document.getElementById('saveEditBtn');
  saveBtn.disabled = true;
  saveBtn.innerText = 'Updating...';

  try {
    const res = await fetch(`/api/admin/receipts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (res.ok && result.success) {
      closeEditModal();
      showToast('Receipt updated successfully!', '✅');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to update receipt.');
    }
  } catch (err) {
    console.error('Error updating receipt:', err);
    alert('Network error while updating receipt.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = 'Update Receipt';
  }
}

async function deleteReceipt(id, receiptNo) {
  if (!confirm(`Are you sure you want to delete Receipt "${receiptNo}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/receipts/${id}`, { method: 'DELETE' });
    const result = await res.json();

    if (res.ok && result.success) {
      selectedReceiptIds.delete(id);
      showToast(`Receipt ${receiptNo} deleted.`, '🗑️');
      await loadAllData();
    } else {
      alert(result.message || 'Failed to delete receipt.');
    }
  } catch (err) {
    console.error('Error deleting receipt:', err);
    alert('Network error while deleting receipt.');
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Window click to close modals
window.onclick = function(e) {
  const addModal = document.getElementById('addModal');
  const editModal = document.getElementById('editModal');
  const bulkModal = document.getElementById('bulkModal');
  const bulkLinkModal = document.getElementById('bulkLinkModal');
  const deleteLinkModal = document.getElementById('deleteLinkModal');

  if (e.target === addModal) closeAddReceiptModal();
  if (e.target === editModal) closeEditModal();
  if (e.target === bulkModal) closeBulkModal();
  if (e.target === bulkLinkModal) closeBulkLinkModal();
  if (e.target === deleteLinkModal) closeDeleteLinkModal();
};

// Initial setup
updateLinksSortIndicators();
updateAdminSortIndicators();
loadAllData();
