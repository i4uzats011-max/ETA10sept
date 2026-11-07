// Extract tracking token from URL (e.g. /track/trk_alpha789)
const pathParts = window.location.pathname.split('/');
const trackingToken = pathParts[pathParts.length - 1];

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Not Scheduled';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getRemainDaysBadge(remainDays) {
  if (remainDays === null || remainDays === undefined) {
    return `<span class="remain-badge badge-warning">ETA Pending</span>`;
  }
  if (remainDays > 1) {
    return `<span class="remain-badge badge-info">⏳ ${remainDays} Days Remaining</span>`;
  } else if (remainDays === 1) {
    return `<span class="remain-badge badge-info">⚡ 1 Day Remaining (Tomorrow)</span>`;
  } else if (remainDays === 0) {
    return `<span class="remain-badge badge-success">📦 Arriving Today</span>`;
  } else {
    const passed = Math.abs(remainDays);
    return `<span class="remain-badge badge-warning">Passed ETA (${passed} ${passed === 1 ? 'day' : 'days'} ago)</span>`;
  }
}

async function loadTrackingData() {
  const loadingEl = document.getElementById('loadingState');
  const errorEl = document.getElementById('errorState');
  const containerEl = document.getElementById('receiptsContainer');
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
      containerEl.style.display = 'none';
      updatedText.innerText = 'Shipment not found';
      return;
    }

    errorEl.style.display = 'none';
    containerEl.style.display = 'block';
    containerEl.innerHTML = '';

    const count = data.receipts.length;
    if (count > 1) {
      const summaryBanner = document.createElement('div');
      summaryBanner.style.cssText = 'background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; justify-content: space-between;';
      summaryBanner.innerHTML = `<span>📦 Total Receipts under this tracking link: <strong>${count}</strong></span>`;
      containerEl.appendChild(summaryBanner);
    }

    data.receipts.forEach(receipt => {
      const card = document.createElement('div');
      card.className = 'tracking-card';

      card.innerHTML = `
        <div class="tracking-card-header">
          <div class="receipt-tag">Receipt No. ${escapeHtml(receipt.receiptNo)}</div>
          <div>${getRemainDaysBadge(receipt.remainDays)}</div>
        </div>

        <div class="eta-highlight-box">
          <div>
            <div class="eta-label">Estimated Time of Arrival (ETA)</div>
            <div class="eta-date">${formatDisplayDate(receipt.eta)}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Remain Days</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #0f172a;">
              ${receipt.remainDays !== null ? (receipt.remainDays >= 0 ? `${receipt.remainDays} Days` : `Overdue by ${Math.abs(receipt.remainDays)}d`) : 'N/A'}
            </div>
          </div>
        </div>

        <div class="details-grid">
          <div class="detail-item">
            <div class="detail-label">Item Name</div>
            <div class="detail-value">${escapeHtml(receipt.itemName || '-')}</div>
          </div>

          <div class="detail-item">
            <div class="detail-label">CBM</div>
            <div class="detail-value">${escapeHtml(receipt.cbm || '0')} m³</div>
          </div>

          <div class="detail-item">
            <div class="detail-label">CTN</div>
            <div class="detail-value">${escapeHtml(receipt.ctn || '0')} Cartons</div>
          </div>

          <div class="detail-item">
            <div class="detail-label">Weight</div>
            <div class="detail-value">${escapeHtml(receipt.weight || '-')}</div>
          </div>

          <div class="detail-item" style="grid-column: span 2;">
            <div class="detail-label">Container No. (not actual)</div>
            <div class="detail-value" style="font-family: monospace; letter-spacing: 0.5px;">${escapeHtml(receipt.containerNo || '-')}</div>
          </div>
        </div>
      `;

      containerEl.appendChild(card);
    });

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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial load
loadTrackingData();

// Auto refresh every 30 seconds
setInterval(loadTrackingData, 30000);
