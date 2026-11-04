import * as XLSX from 'xlsx';

export async function downloadContainerWiseRateExcel(): Promise<void> {
  const res = await fetch('/api/admin/rates/container-wise');
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch container rate data');
  }

  const { summary, details } = data;

  // Format Sheet 1: Container Rate Summary
  const summaryRows = (summary || []).map((c: any, idx: number) => ({
    'Sr. No': idx + 1,
    'Container Alias': c.container,
    'Carrier Container No': c.containerNumber,
    'Shipping Line': c.shippingLine,
    'Origin Warehouse': c.warehouse,
    'Loading Date': c.loadingDate,
    'Port Arrival Date (rawEta)': c.portDate,
    'Delivery Date': c.deliveryDate,
    Status: c.status,
    'Total Receipts in Container': c.receiptCount,
    'Total Cartons (CTN)': c.totalCartons,
    'Total Weight (KG)': c.totalWeight,
    'Total Volume (CBM)': c.totalVolume,
    'Overall / Receipt Freight Rates': c.ratesFound,
    'Receipts With Rate': c.receiptsWithRate,
    'Receipts Without Rate': c.receiptsWithoutRate,
    'Rate Fixed Receipts Count': c.rateFixedCount,
    'Total Freight Cost (₹)': c.totalCost,
  }));

  const wsSummary = XLSX.utils.json_to_sheet(
    summaryRows.length > 0 ? summaryRows : [{ Notice: 'No container records found' }]
  );
  wsSummary['!cols'] = [
    { wch: 8 }, // Sr
    { wch: 16 }, // Container
    { wch: 20 }, // Container Number
    { wch: 14 }, // Shipping Line
    { wch: 18 }, // Warehouse
    { wch: 14 }, // Loading Date
    { wch: 16 }, // Port Date
    { wch: 14 }, // Delivery Date
    { wch: 14 }, // Status
    { wch: 16 }, // Total Receipts
    { wch: 14 }, // Cartons
    { wch: 14 }, // Weight
    { wch: 14 }, // Volume
    { wch: 28 }, // Freight Rates
    { wch: 16 }, // With Rate
    { wch: 16 }, // Without Rate
    { wch: 18 }, // Fixed Count
    { wch: 18 }, // Total Cost
  ];

  // Format Sheet 2: Receipt-Wise Rate Manifest
  const detailRows = (details || []).map((r: any, idx: number) => ({
    'Sr. No': idx + 1,
    'Container Alias': r.container,
    'Carrier Container No': r.containerNumber,
    'Shipping Line': r.shippingLine,
    'Receipt No': r.receipt,
    'Party / Shipper Name': r.party,
    'Phone / WhatsApp': r.phone,
    'Main Marka': r.mainMarka,
    'Sub Marka': r.subMarka,
    'Overall / Receipt Freight Rate': r.rate,
    'Rate Fixed?': r.rateFixed,
    'Total Cost (₹)': r.totalCost,
    'Cartons (CTN)': r.quantity,
    'Weight (KG)': r.weight,
    'Volume (CBM)': r.volume,
    Commodity: r.commodity,
    'Items Breakdown': r.goodsBreakdown,
    'Notification Status': r.messageSent,
    'Notification Sent Date': r.messageSentDate,
    'Origin Warehouse': r.warehouse,
    'Loading Date': r.loadingDate,
    'Port Date (rawEta)': r.portDate,
    'Delivery Date': r.deliveryDate,
  }));

  const wsDetails = XLSX.utils.json_to_sheet(
    detailRows.length > 0 ? detailRows : [{ Notice: 'No receipt records found' }]
  );
  wsDetails['!cols'] = [
    { wch: 8 }, // Sr
    { wch: 16 }, // Container
    { wch: 20 }, // Container Number
    { wch: 14 }, // Shipping Line
    { wch: 16 }, // Receipt No
    { wch: 22 }, // Party
    { wch: 16 }, // Phone
    { wch: 16 }, // Main Marka
    { wch: 16 }, // Sub Marka
    { wch: 28 }, // Overall / Receipt Freight Rate
    { wch: 12 }, // Rate Fixed
    { wch: 16 }, // Total Cost
    { wch: 12 }, // Cartons
    { wch: 12 }, // Weight
    { wch: 12 }, // Volume
    { wch: 24 }, // Commodity
    { wch: 35 }, // Items Breakdown
    { wch: 16 }, // Notification Status
    { wch: 20 }, // Notification Sent Date
    { wch: 16 }, // Warehouse
    { wch: 14 }, // Loading Date
    { wch: 16 }, // Port Date
    { wch: 14 }, // Delivery Date
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Container_Rate_Summary');
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Receipt_Rate_Manifest');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Container_Wise_Freight_Rate_List_${today}.xlsx`);
}
