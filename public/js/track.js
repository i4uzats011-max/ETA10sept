// Extract tracking token from URL (e.g. /track/trk_alpha789)
const pathParts = window.location.pathname.split('/');
const trackingToken = pathParts[pathParts.length - 1];

let allReceipts = [];
let currentFilter = 'active'; // Default: 'active' (Other than Delivered)
let searchQuery = '';
let currentSortColumn = 'date'; // Default: sort by delivery date / ETA
let currentSortDirection = 'desc'; // Default: newest on top ("new by show upside")
let currentView = 'table'; // 'table' or 'cards'

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Not Scheduled';
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
    const delDate = r.deliveryDate ? formatDisplayDate(r.deliveryDate) : 'Delivered';
    return `<span class="badge badge-delivered">✅ Delivered (${delDate})</span>`;
  }

  if (r.status === 'in_warehouse' && !r.eta) {
    return `<span class="badge badge-warehouse">🏢 In Warehouse</span>`;
  }

  const remainDays = r.remainDays;
  if (remainDays === null || remainDays === undefined) {
    return `<span class="badge badge-warning">ETA Pending</span>`;
  }
  if (remainDays > 1) {
    return `<span class="badge badge-info">⏳ ${remainDays} days</span>`;
  } else if (remainDays === 1) {
    return `<span class="badge badge-info">⚡ Tomorrow</span>`;
  } else if (remainDays === 0) {
    return `<span class="badge badge-success">📦 Arriving Today</span>`;
  } else {
    const passed = Math.abs(remainDays);
    return `<span class="badge badge-warning">Passed (${passed}d ago)</span>`;
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

async function loadTrackingData() {
  const loadingEl = document.getElementById('loadingState');
  const errorEl = document.getElementById('errorState');
  const mainContent = document.getElementById('mainContent');
  const updatedText = document.getElementById('lastUpdatedText');
  const refreshIcon = document.getElementById('refreshIcon');

  refreshIcon.style.transform = 'rotate(180deg)';
  setTimeout(() => refreshIcon.style.transform = 'none', 300);

  try {
    const response = await fetch(`/api/track/${encodeURIComponent(trackingToken)}`);
    const data = await response.json();

    loadingEl.style.display = 'none';

    if (!response.ok || !data.success || !data.receipts || data.receipts.length === 0) {
      errorEl.style.display = 'block';
      document.getElementById('errorMessage').innerText = data.message || 'Tracking Link Invalid or Expired';
      mainContent.style.display = 'none';
      updatedText.innerText = 'Shipment not found';
      return;
    }

    errorEl.style.display = 'none';
    mainContent.style.display = 'block';

    allReceipts = data.receipts;
    updateCounts();
    applyFilterAndSort();

    const now = new Date();
    updatedText.innerText = `Updated just now (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`;

  } catch (err) {
    console.error('Error fetching tracking info:', err);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    document.getElementById('errorMessage').innerText = 'Unable to connect to tracking server.';
    updatedText.innerText = 'Failed to load';
  }
}

function updateCounts() {
  const activeCount = allReceipts.filter(r => r.status !== 'delivered').length;
  const deliveredCount = allReceipts.filter(r => r.status === 'delivered').length;
  const totalCount = allReceipts.length;

  document.getElementById('countActive').innerText = activeCount;
  document.getElementById('countDelivered').innerText = deliveredCount;
  document.getElementById('countAll').innerText = totalCount;
}

function setStatusFilter(filter) {
  currentFilter = filter;

  document.getElementById('tabActive').classList.toggle('active', filter === 'active');
  document.getElementById('tabDelivered').classList.toggle('active', filter === 'delivered');
  document.getElementById('tabAll').classList.toggle('active', filter === 'all');

  applyFilterAndSort();
}

function handleSearchInput() {
  const input = document.getElementById('trackSearchInput');
  searchQuery = (input.value || '').trim().toLowerCase();
  
  const clearBtn = document.getElementById('clearSearchBtn');
  clearBtn.style.display = searchQuery ? 'inline-flex' : 'none';

  applyFilterAndSort();
}

function clearSearch() {
  const input = document.getElementById('trackSearchInput');
  input.value = '';
  searchQuery = '';
  document.getElementById('clearSearchBtn').style.display = 'none';
  applyFilterAndSort();
}

function handleSort(column) {
  if (currentSortColumn === column) {
    // Toggle direction
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    // Default to newest first for date; asc for text
    currentSortDirection = (column === 'date' || column === 'remainDays') ? 'desc' : 'asc';
  }
  updateSortIndicators();
  applyFilterAndSort();
}

function updateSortIndicators() {
  const sortColumns = ['receiptNo', 'itemName', 'containerNo', 'status', 'date', 'remainDays'];
  sortColumns.forEach(col => {
    const arrowEl = document.getElementById(`sort_${col}`);
    const thEl = arrowEl ? arrowEl.parentElement : null;

    if (col === currentSortColumn) {
      if (arrowEl) arrowEl.innerText = currentSortDirection === 'asc' ? '▲' : '▼';
      if (thEl) {
        thEl.classList.remove('sorted-asc', 'sorted-desc');
        thEl.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    } else {
      if (arrowEl) arrowEl.innerText = '↕';
      if (thEl) thEl.classList.remove('sorted-asc', 'sorted-desc');
    }
  });

  const sortNotice = document.getElementById('sortNoticeText');
  if (sortNotice) {
    const colName = currentSortColumn === 'date' ? 'Date (Delivery/ETA)' : currentSortColumn;
    const dirName = currentSortDirection === 'desc' ? 'newest / descending' : 'ascending';
    sortNotice.innerText = `Sorted by ${colName} (${dirName}) • Click column headers to sort`;
  }
}

function applyFilterAndSort() {
  // 1. Filter by status
  let filtered = allReceipts.filter(r => {
    if (currentFilter === 'active') {
      return r.status !== 'delivered';
    } else if (currentFilter === 'delivered') {
      return r.status === 'delivered';
    }
    return true; // 'all'
  });

  // 2. Filter by search query text
  if (searchQuery) {
    filtered = filtered.filter(r => {
      const matchReceipt = r.receiptNo && r.receiptNo.toLowerCase().includes(searchQuery);
      const matchItem = r.itemName && r.itemName.toLowerCase().includes(searchQuery);
      const matchContainer = r.containerNo && r.containerNo.toLowerCase().includes(searchQuery);
      const matchStatus = r.status && r.status.toLowerCase().includes(searchQuery);
      return matchReceipt || matchItem || matchContainer || matchStatus;
    });
  }

  // 3. Sort
  filtered.sort((a, b) => {
    let valA, valB;

    if (currentSortColumn === 'date') {
      // Pick deliveryDate if available, otherwise eta
      valA = a.deliveryDate || a.eta || '';
      valB = b.deliveryDate || b.eta || '';
    } else if (currentSortColumn === 'remainDays') {
      // Handle nulls
      valA = a.remainDays !== null && a.remainDays !== undefined ? a.remainDays : -999999;
      valB = b.remainDays !== null && b.remainDays !== undefined ? b.remainDays : -999999;
      return currentSortDirection === 'asc' ? valA - valB : valB - valA;
    } else {
      valA = (a[currentSortColumn] || '').toString().toLowerCase();
      valB = (b[currentSortColumn] || '').toString().toLowerCase();
    }

    if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Summary meta text
  const summaryText = document.getElementById('filteredSummaryText');
  const filterLabel = currentFilter === 'active' ? 'active (other than delivered)' : (currentFilter === 'delivered' ? 'delivered' : 'all');
  summaryText.innerText = `Showing ${filtered.length} of ${allReceipts.length} receipts • Filter: ${filterLabel}`;

  // Render view
  renderView(filtered);
}

function renderView(receipts) {
  const tableContainer = document.getElementById('tableViewContainer');
  const cardsContainer = document.getElementById('cardsViewContainer');
  const noResultsEl = document.getElementById('noResultsState');

  if (receipts.length === 0) {
    tableContainer.style.display = 'none';
    cardsContainer.style.display = 'none';
    noResultsEl.style.display = 'block';

    const detailEl = document.getElementById('noResultsDetail');
    if (searchQuery) {
      detailEl.innerText = `No receipts matched your search "${searchQuery}". Click "Clear" or search for another keyword.`;
    } else if (currentFilter === 'delivered') {
      detailEl.innerText = 'No delivered shipments found under this link. Select "Other than Delivered" to view ongoing shipments.';
    } else {
      detailEl.innerText = 'No shipments match the selected filter. Click "All Receipts" to view all items.';
    }
    return;
  }

  noResultsEl.style.display = 'none';

  if (currentView === 'table') {
    tableContainer.style.display = 'block';
    cardsContainer.style.display = 'none';
    renderTable(receipts);
  } else {
    tableContainer.style.display = 'none';
    cardsContainer.style.display = 'block';
    renderCards(receipts);
  }
}

function renderTable(receipts) {
  const tbody = document.getElementById('trackTableBody');
  tbody.innerHTML = receipts.map(r => {
    let dateDisplay = '';
    if (r.status === 'delivered') {
      dateDisplay = `<div style="color: #166534; font-weight: 700;">✅ ${formatDisplayDate(r.deliveryDate)}</div><div style="font-size: 0.75rem; color: #64748b;">Delivered</div>`;
    } else {
      dateDisplay = `<div style="color: #1e3a8a; font-weight: 700;">📅 ${formatDisplayDate(r.eta)}</div><div style="font-size: 0.75rem; color: #64748b;">Estimated Arrival</div>`;
    }

    let containerDisplay = escapeHtml(r.containerNo || '-');
    if (r.status === 'in_warehouse' && (!r.containerNo || r.containerNo.toLowerCase().includes('warehouse'))) {
      containerDisplay = `<span class="badge badge-warehouse">🏢 In Warehouse (Not Loaded)</span>`;
    } else {
      containerDisplay = `<span style="font-family: monospace; font-weight: 600; color: #1e40af;">${containerDisplay}</span>`;
    }

    return `
      <tr>
        <td>
          <span style="font-weight: 800; color: #0f172a; font-size: 0.95rem;">
            ${escapeHtml(r.receiptNo)}
          </span>
        </td>
        <td>
          <div style="font-weight: 600; color: #1e293b;">${escapeHtml(r.itemName || '-')}</div>
        </td>
        <td>
          <span style="font-size: 0.825rem; color: #475569;">
            ${r.cbm ? r.cbm + ' m³' : '-'} / ${r.ctn ? r.ctn + ' ctn' : '-'} / ${r.weight || '-'}
          </span>
        </td>
        <td>
          ${containerDisplay}
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
      </tr>
    `;
  }).join('');
}

function renderCards(receipts) {
  const container = document.getElementById('cardsViewContainer');
  container.innerHTML = receipts.map(r => {
    const isDelivered = r.status === 'delivered';
    const mainDateLabel = isDelivered ? 'Delivery Date' : 'Estimated Time of Arrival (ETA)';
    const mainDateValue = isDelivered ? formatDisplayDate(r.deliveryDate) : formatDisplayDate(r.eta);

    let containerText = escapeHtml(r.containerNo || '-');
    if (r.status === 'in_warehouse' && (!r.containerNo || r.containerNo.toLowerCase().includes('warehouse'))) {
      containerText = 'In Warehouse (Not Loaded)';
    }

    return `
      <div class="tracking-card">
        <div class="tracking-card-header">
          <div class="receipt-tag">Receipt No. ${escapeHtml(r.receiptNo)}</div>
          <div>${getStatusBadge(r.status)}</div>
        </div>

        <div class="eta-highlight-box">
          <div>
            <div class="eta-label">${mainDateLabel}</div>
            <div class="eta-date">${mainDateValue}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Status / Days</div>
            <div>${getRemainDaysBadge(r)}</div>
          </div>
        </div>

        <div class="details-grid">
          <div class="detail-item">
            <div class="detail-label">Item Name</div>
            <div class="detail-value">${escapeHtml(r.itemName || '-')}</div>
          </div>

          <div class="detail-item">
            <div class="detail-label">CBM</div>
            <div class="detail-value">${escapeHtml(r.cbm || '0')} m³</div>
          </div>

          <div class="detail-item">
            <div class="detail-label">CTN</div>
            <div class="detail-value">${escapeHtml(r.ctn || '0')} Cartons</div>
          </div>

          <div class="detail-item">
            <div class="detail-label">Weight</div>
            <div class="detail-value">${escapeHtml(r.weight || '-')}</div>
          </div>

          <div class="detail-item" style="grid-column: span 2;">
            <div class="detail-label">Allocated Container No.</div>
            <div class="detail-value" style="font-family: monospace; letter-spacing: 0.5px;">${containerText}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function switchView(view) {
  currentView = view;
  document.getElementById('viewBtnTable').classList.toggle('active', view === 'table');
  document.getElementById('viewBtnCards').classList.toggle('active', view === 'cards');
  applyFilterAndSort();
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

// Initial indicator setup & load
updateSortIndicators();
loadTrackingData();

// Auto refresh every 30 seconds
setInterval(loadTrackingData, 30000);
