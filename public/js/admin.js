let allReceipts = [];

function showToast(message, icon = '📋') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.innerText = message;
  toastIcon.innerText = icon;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
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

function getRemainDaysBadge(remainDays) {
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

async function loadReceipts() {
  const tbody = document.getElementById('receiptsTableBody');
  try {
    const res = await fetch('/api/admin/receipts');
    const data = await res.json();

    if (data.success) {
      allReceipts = data.receipts || [];
      renderReceipts(allReceipts);
      updateStats(allReceipts);
      loadExistingTokens();
    } else {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">Failed to load receipts.</td></tr>`;
    }
  } catch (err) {
    console.error('Error fetching receipts:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">Network error loading receipts.</td></tr>`;
  }
}

function updateStats(receipts) {
  document.getElementById('statTotalReceipts').innerText = receipts.length;

  const uniqueTokens = new Set(receipts.map(r => r.trackingToken)).size;
  document.getElementById('statActiveLinks').innerText = uniqueTokens;

  const thisWeekCount = receipts.filter(r => r.remainDays !== null && r.remainDays >= 0 && r.remainDays <= 7).length;
  document.getElementById('statUpcoming').innerText = thisWeekCount;
}

function renderReceipts(receipts) {
  const tbody = document.getElementById('receiptsTableBody');

  if (receipts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">
          No receipts found. Click <strong>"Add New Receipt"</strong> to create one.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = receipts.map(r => {
    return `
      <tr>
        <td>
          <strong style="color: #0f172a;">${escapeHtml(r.receiptNo)}</strong>
        </td>
        <td>
          <div>${escapeHtml(r.itemName || '-')}</div>
        </td>
        <td>
          <span style="font-size: 0.825rem; color: #475569;">
            ${r.cbm ? r.cbm + ' m³' : '-'} / ${r.ctn ? r.ctn + ' ctn' : '-'} / ${r.weight || '-'}
          </span>
        </td>
        <td>
          <span style="font-family: monospace; font-weight: 600; color: #1e40af;">
            ${escapeHtml(r.containerNo || '-')}
          </span>
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.8rem; color: #64748b;">
            ${escapeHtml(r.actualContainerNo || '(none)')}
          </span>
        </td>
        <td>
          <strong>${formatDisplayDate(r.eta)}</strong>
        </td>
        <td>
          ${getRemainDaysBadge(r.remainDays)}
        </td>
        <td>
          <div class="link-cell">
            <span class="quick-token-badge" title="Token: ${r.trackingToken}">${r.trackingToken}</span>
            <button class="btn btn-secondary btn-sm" onclick="copyTrackingLink('${r.trackingToken}')" title="Copy tracking link">
              📋 Copy
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openTrackingLink('${r.trackingToken}')" title="View what public sees">
              👁️ View
            </button>
          </div>
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
}

function handleSearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!query) {
    renderReceipts(allReceipts);
    return;
  }

  const filtered = allReceipts.filter(r => 
    (r.receiptNo && r.receiptNo.toLowerCase().includes(query)) ||
    (r.itemName && r.itemName.toLowerCase().includes(query)) ||
    (r.containerNo && r.containerNo.toLowerCase().includes(query)) ||
    (r.trackingToken && r.trackingToken.toLowerCase().includes(query))
  );

  renderReceipts(filtered);
}

// Token Options Toggle in Add Modal
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
    select.innerHTML = '<option value="">-- Choose existing link --</option>';

    if (data.success && data.tokens) {
      data.tokens.forEach(item => {
        const option = document.createElement('option');
        option.value = item.token;
        option.textContent = `${item.token} (Receipts: ${item.receipts.join(', ')})`;
        select.appendChild(option);
      });
    }
  } catch (err) {
    console.error('Error loading tokens:', err);
  }
}

// Add Modal Controls
function openAddReceiptModal() {
  document.getElementById('addReceiptForm').reset();
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
    alert('Please select an existing tracking link from the list.');
    return;
  }

  const payload = {
    receiptNo: document.getElementById('receiptNo').value,
    itemName: document.getElementById('itemName').value,
    cbm: document.getElementById('cbm').value,
    ctn: document.getElementById('ctn').value,
    weight: document.getElementById('weight').value,
    containerNo: document.getElementById('containerNo').value,
    actualContainerNo: document.getElementById('actualContainerNo').value,
    eta: document.getElementById('eta').value,
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
      loadReceipts();
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

// Edit Modal Controls
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
  document.getElementById('editEta').value = receipt.eta || '';
  document.getElementById('editAdminNotes').value = receipt.adminNotes || '';

  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
}

async function submitEditReceipt(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value;

  const payload = {
    receiptNo: document.getElementById('editReceiptNo').value,
    itemName: document.getElementById('editItemName').value,
    cbm: document.getElementById('editCbm').value,
    ctn: document.getElementById('editCtn').value,
    weight: document.getElementById('editWeight').value,
    containerNo: document.getElementById('editContainerNo').value,
    actualContainerNo: document.getElementById('editActualContainerNo').value,
    eta: document.getElementById('editEta').value,
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
      showToast('ETA and receipt details updated!', '✅');
      loadReceipts();
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

// Delete Receipt
async function deleteReceipt(id, receiptNo) {
  if (!confirm(`Are you sure you want to delete Receipt "${receiptNo}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/receipts/${id}`, { method: 'DELETE' });
    const result = await res.json();

    if (res.ok && result.success) {
      showToast(`Receipt ${receiptNo} deleted.`, '🗑️');
      loadReceipts();
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

// Close modals when clicking outside
window.onclick = function(e) {
  const addModal = document.getElementById('addModal');
  const editModal = document.getElementById('editModal');
  if (e.target === addModal) closeAddReceiptModal();
  if (e.target === editModal) closeEditModal();
};

// Initial load
loadReceipts();
