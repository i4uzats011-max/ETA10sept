import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isAdminAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { parseReceiptDate, formatReceiptDate, formatGlobalDate, calculateDaysBetween } from '@/lib/dateUtils';
import { invalidateContainerCache } from '@/lib/redis';
import { recordEditLog } from '@/lib/auditLog';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

interface RowDateChange {
  container: string;
  containerNumber: string;
  blNumber?: string;
  shippingLine: string;
  portName: string;
  isEtaChanged: boolean;
  oldEta: string;
  newEta: string;
  etaDaysShift: number | null;
  isPortDateChanged: boolean;
  oldPortDate: string;
  newPortDate: string;
  portDaysShift: number | null;
  remarks: string;
}

/**
 * Normalizes input date from cell (Excel serial, Date object, string) to standard YYYY-MM-DD
 */
function normalizeDate(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (!s || s === 'N/A' || s === '-' || s === '—' || s.toLowerCase() === 'pending') {
    return null;
  }
  const parsed = parseReceiptDate(s);
  if (!parsed || isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Determines if a container is already delivered
 */
function isContainerDelivered(c: any): boolean {
  if (!c) return false;
  if (c.isDelivered === true) return true;
  if (
    c.deliveryDate &&
    typeof c.deliveryDate === 'string' &&
    c.deliveryDate.trim() &&
    c.deliveryDate !== '—' &&
    c.deliveryDate !== 'N/A' &&
    c.deliveryDate.toLowerCase() !== 'in transit'
  ) {
    return true;
  }
  if (c.status && typeof c.status === 'string' && c.status.toLowerCase().trim() === 'delivered') {
    return true;
  }
  return false;
}

/**
 * Builds the comprehensive Date Change .txt report
 */
function generateDateChangeTxtReport(
  dateChanges: RowDateChange[],
  meta: {
    fileName: string;
    username: string;
    role: string;
    totalRows: number;
    totalUpdated: number;
    timestamp: Date;
  }
): string {
  const timeFormatted = meta.timestamp.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  const divider = '='.repeat(80);
  const subDivider = '-'.repeat(80);

  let out = '';
  out += `${divider}\n`;
  out += `          CONTAINER DATE CHANGE AUDIT REPORT (कंटेनर तारीख परिवर्तन रिपोर्ट)\n`;
  out += `                        US INTERNATIONAL LOGISTICS\n`;
  out += `${divider}\n`;
  out += `Generated At       : ${timeFormatted} IST\n`;
  out += `Updated By         : ${meta.username} (${meta.role})\n`;
  out += `Uploaded File Name : ${meta.fileName || 'Container_Bulk_Update.xlsx'}\n`;
  out += `Total Rows In File : ${meta.totalRows}\n`;
  out += `Containers Updated : ${meta.totalUpdated}\n`;
  out += `Containers W/ Date : ${dateChanges.length} container(s) had date modifications\n`;
  out += `${divider}\n\n`;

  out += `DETAILED LIST OF CONTAINERS WITH DATE CHANGES:\n`;
  out += `${subDivider}\n\n`;

  dateChanges.forEach((c, idx) => {
    out += `[${idx + 1}] CONTAINER ALIAS : ${c.container}\n`;
    out += `    Carrier No      : ${c.containerNumber || 'Not Allotted / Blank'}\n`;
    out += `    BL No           : ${c.blNumber || 'Not Set / Blank'}\n`;
    out += `    Shipping Line   : ${c.shippingLine || 'Default'}\n`;
    out += `    Destination Port: ${c.portName || 'India Port'}\n`;

    if (c.isPortDateChanged) {
      const shiftStr =
        c.portDaysShift !== null
          ? c.portDaysShift > 0
            ? `+${c.portDaysShift} Days (Delayed)`
            : c.portDaysShift < 0
            ? `${c.portDaysShift} Days (Earlier)`
            : 'Same Day'
          : 'Initial Assignment';
      out += `\n    * PORT ARRIVAL DATE (Vessel ETA / एक्चुअल डेट) [CHANGED]:\n`;
      out += `      - Previous Date : ${c.oldPortDate || 'Not Set'} (${c.oldPortDate ? formatGlobalDate(c.oldPortDate) : 'N/A'})\n`;
      out += `      - New Port Date : ${c.newPortDate} (${formatGlobalDate(c.newPortDate)})\n`;
      out += `      - Date Shift    : ${shiftStr}\n`;
    } else {
      out += `\n    * Port Arrival Date: Unchanged (${c.oldPortDate ? formatGlobalDate(c.oldPortDate) : 'Not Set'})\n`;
    }

    if (c.isEtaChanged) {
      const shiftStr =
        c.etaDaysShift !== null
          ? c.etaDaysShift > 0
            ? `+${c.etaDaysShift} Days (Extended)`
            : c.etaDaysShift < 0
            ? `${c.etaDaysShift} Days (Advanced)`
            : 'Same Day'
          : 'Initial Assignment';
      out += `\n    * DESTINATION ETA (Customer Grace Date / ग्रेस डेट) [CHANGED]:\n`;
      out += `      - Previous Date : ${c.oldEta || 'Not Set'} (${c.oldEta ? formatGlobalDate(c.oldEta) : 'N/A'})\n`;
      out += `      - New ETA Date  : ${c.newEta} (${formatGlobalDate(c.newEta)})\n`;
      out += `      - Date Shift    : ${shiftStr}\n`;
    } else {
      out += `\n    * Destination ETA  : Unchanged (${c.oldEta ? formatGlobalDate(c.oldEta) : 'Not Set'})\n`;
    }

    if (c.remarks) {
      out += `\n    * Remarks Added    : "${c.remarks}"\n`;
    }

    out += `\n${subDivider}\n\n`;
  });

  out += `${divider}\n`;
  out += `AUDIT SUMMARY:\n`;
  out += `  - Total Containers Checked  : ${meta.totalRows}\n`;
  out += `  - Total Containers Updated  : ${meta.totalUpdated}\n`;
  out += `  - Containers w/ Date Shifts : ${dateChanges.length} [FOCUS: AUDIT LOG CREATED]\n`;
  out += `  - Containers w/o Date Shifts: ${meta.totalUpdated - dateChanges.length}\n`;
  out += `  - Database Sync Status      : Completed in MongoDB & Redis Cache Cleared\n`;
  out += `${divider}\n`;
  out += `                         --- END OF AUDIT REPORT ---\n`;

  return out;
}

/**
 * GET: Download Excel Template with container list
 * Columns:
 * 1. Sr. No.
 * 2. Actual Container No. (Carrier Container)
 * 3. Internal Container (Container Alias)
 * 4. Shipping Line Company Name (Carrier)
 * 5. ETA Date (Blank column for update)
 * 6. Port Date (Blank column for update)
 * 7. Port Name (Blank column for update)
 * 8. Remarks (Blank column for update)
 * 9. Last ETA (Current DB ETA)
 * 10. Last Port Date (Current DB Port Date)
 * 11. Current Port Name (Current DB Port Name)
 * 12. Latest Remark (Current DB Remark)
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized: Admin authentication required' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    // 1. Fetch saved containers from Container collection
    const storedContainers = await Container.find({})
      .select({
        container: 1,
        containerNumber: 1,
        blNumber: 1,
        shippingLine: 1,
        destinationDate: 1,
        eta: 1,
        rawEta: 1,
        portDate: 1,
        shippedTo: 1,
        remarks: 1,
        isDelivered: 1,
        status: 1,
        deliveryDate: 1,
      })
      .sort({ container: 1 })
      .lean();

    const containerMap = new Map<string, any>();
    for (const c of storedContainers) {
      containerMap.set(String(c.container || '').toUpperCase().trim(), c);
    }

    // 2. Also fetch distinct containers from Shipment to catch any not yet synced to Container
    const distinctShipments = await Shipment.aggregate([
      { $match: { container: { $exists: true, $nin: ['', null] } } },
      {
        $group: {
          _id: '$container',
          containerNumber: { $first: '$containerNumber' },
          blNumber: { $first: '$blNumber' },
          shippingLine: { $first: '$shippingLine' },
          destinationDate: { $first: '$destinationDate' },
          eta: { $first: '$eta' },
          rawEta: { $first: '$rawEta' },
          portDate: { $first: '$portDate' },
          shippedTo: { $first: '$shippedTo' },
          status: { $first: '$status' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    for (const s of distinctShipments) {
      const key = String(s._id || '').toUpperCase().trim();
      if (!key) continue;
      if (!containerMap.has(key)) {
        containerMap.set(key, {
          container: s._id,
          containerNumber: s.containerNumber || '',
          blNumber: s.blNumber || '',
          shippingLine: s.shippingLine || 'MSC',
          destinationDate: s.destinationDate || s.eta || '',
          eta: s.eta || '',
          rawEta: s.rawEta || s.portDate || '',
          portDate: s.portDate || s.rawEta || '',
          shippedTo: s.shippedTo || 'India Port',
          remarks: [],
          status: s.status || 'In Transit',
        });
      } else {
        const existing = containerMap.get(key);
        if (!existing.containerNumber && s.containerNumber) existing.containerNumber = s.containerNumber;
        if (!existing.blNumber && s.blNumber) existing.blNumber = s.blNumber;
        if (!existing.shippingLine && s.shippingLine) existing.shippingLine = s.shippingLine;
        if (!existing.destinationDate && s.destinationDate) existing.destinationDate = s.destinationDate;
        if (!existing.rawEta && s.rawEta) existing.rawEta = s.rawEta;
        if (!existing.shippedTo && s.shippedTo) existing.shippedTo = s.shippedTo;
      }
    }

    const allContainers = Array.from(containerMap.values());
    allContainers.sort((a, b) => String(a.container).localeCompare(String(b.container), undefined, { numeric: true }));

    // User requirement: Delivered containers are not required to be updated anymore.
    // Exclude delivered containers and export only undelivered / active containers.
    const undeliveredContainers = allContainers.filter((c) => !isContainerDelivered(c));

    // 3. Create Excel Workbook using ExcelJS with clean styling
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'US International Logistics';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Container Updates', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });

    // Define column headers exactly as requested
    worksheet.columns = [
      { header: 'Container No.', key: 'sr', width: 14 },
      { header: 'Actual Container No.', key: 'actual', width: 24 },
      { header: 'Internal Container', key: 'internal', width: 20 },
      { header: 'BL No.', key: 'blNumber', width: 22 },
      { header: 'Shipping Line Company Name', key: 'shippingLine', width: 26 },
      { header: 'ETA Date', key: 'newEta', width: 18 },
      { header: 'Port Date', key: 'newPortDate', width: 18 },
      { header: 'Port Name', key: 'newPortName', width: 28 },
      { header: 'Remarks', key: 'newRemarks', width: 35 },
      { header: 'Last ETA', key: 'lastEta', width: 18 },
      { header: 'Last Port Date', key: 'lastPortDate', width: 18 },
      { header: 'Current Port Name', key: 'currentPortName', width: 28 },
      { header: 'Latest Remark', key: 'latestRemark', width: 35 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 32;

    headerRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      if (colNumber <= 5) {
        // Container & BL info columns: Navy Blue (#1E3A8A)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' },
        };
      } else if (colNumber <= 9) {
        // Editable update columns: Forest Green (#047857)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF047857' },
        };
      } else {
        // Previous reference columns: Slate Gray (#475569)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF475569' },
        };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    // Populate rows (Undelivered Containers Only)
    undeliveredContainers.forEach((c, idx) => {
      const rawLastEta = c.destinationDate || c.eta || '';
      const cleanLastEta = rawLastEta && rawLastEta !== 'N/A' && rawLastEta !== 'Pending' ? rawLastEta : '';

      const rawLastPortDate = c.portDate || c.rawEta || '';
      const cleanLastPortDate = rawLastPortDate && rawLastPortDate !== 'N/A' && rawLastPortDate !== 'Pending' ? rawLastPortDate : '';

      const cleanBlNumber = c.blNumber && c.blNumber !== 'N/A' && c.blNumber !== 'Pending' && c.blNumber !== '-' ? String(c.blNumber).trim() : '';

      let latestRemark = '';
      if (Array.isArray(c.remarks) && c.remarks.length > 0) {
        const last = c.remarks[c.remarks.length - 1];
        latestRemark = last?.remarks || '';
      }

      const row = worksheet.addRow({
        sr: idx + 1,
        actual: c.containerNumber || '',
        internal: c.container || '',
        blNumber: cleanBlNumber, // If found, show it; if not found, blank!
        shippingLine: c.shippingLine || 'MSC',
        newEta: '',       // Blank for user to enter
        newPortDate: '',  // Blank for user to enter
        newPortName: '',  // Blank for user to enter
        newRemarks: '',   // Blank for user to enter
        lastEta: cleanLastEta,
        lastPortDate: cleanLastPortDate,
        currentPortName: c.shippedTo || 'India Port',
        latestRemark: latestRemark,
      });

      row.height = 24;

      // Cell formatting
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = {
          vertical: 'middle',
          horizontal: [1, 6, 7, 10, 11].includes(colNumber) ? 'center' : 'left',
        };

        // Light highlight for editable blank update columns (6 to 9)
        if (colNumber >= 6 && colNumber <= 9) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0FDF4' }, // Light emerald tint to prompt user input
          };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Container_Update_Template_Undelivered_${dateStr}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Error generating container update template:', err);
    return NextResponse.json({ error: err?.message || 'Failed to generate Excel template' }, { status: 500 });
  }
}

/**
 * POST: Upload updated Excel file, apply updates, detect date changes, and generate .txt file
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized: Admin authentication required' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Please select an Excel file (.xlsx or .xls) to upload' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Read Excel using XLSX with cell dates enabled
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'The uploaded Excel file does not contain any worksheets' }, { status: 400 });
    }

    // Prefer worksheet named 'Container Updates' or fallback to first sheet
    const sheetName = workbook.SheetNames.find((s) => s.toLowerCase().includes('container')) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in the uploaded Excel worksheet' }, { status: 400 });
    }

    await connectToDatabase();

    const user = getAuthenticatedUser(req);
    const username = user?.username || 'admin';
    const userRole = user?.role || 'admin';
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const dateChanges: RowDateChange[] = [];
    const updatedContainersList: string[] = [];
    const warnings: string[] = [];
    let skippedCount = 0;
    let totalUpdated = 0;

    // Helper: Find value from row matching any candidate key variant
    const getRowVal = (row: Record<string, any>, candidates: string[]): any => {
      const rowKeys = Object.keys(row);
      for (const cand of candidates) {
        const foundKey = rowKeys.find(
          (k) =>
            k.toLowerCase().trim().replace(/[^a-z0-9]/g, '') ===
            cand.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
        );
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
          const val = row[foundKey];
          if (typeof val === 'string' && val.trim().length > 0) return val.trim();
          if (val instanceof Date) return val;
          if (typeof val === 'number') return val;
        }
      }
      return '';
    };

    // Process each row
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // Excel row numbering (1-based, header is row 1)

      const actualContainerVal = String(
        getRowVal(row, ['actual containerno', 'actual container no', 'actual container', 'carrier container', 'actual']) || ''
      ).trim();

      const internalContainerVal = String(
        getRowVal(row, ['internal container', 'internal', 'container alias', 'container', 'alias']) || ''
      ).trim();

      const blVal = String(
        getRowVal(row, [
          'bl no',
          'bl no.',
          'bl number',
          'b/l no',
          'b/l no.',
          'b/l number',
          'bl',
          'bill of lading',
          'bill of lading no',
          'bill of lading number',
        ]) || ''
      ).trim().toUpperCase();

      const shippingLineVal = String(
        getRowVal(row, ['shipping line company name', 'shipping line', 'carrier', 'company']) || ''
      ).trim();

      const etaDateRaw = getRowVal(row, [
        'eta date',
        'new eta date',
        'eta',
        'destination date',
        'grace eta',
        'customer delivery eta',
      ]);

      const portDateRaw = getRowVal(row, [
        'port date',
        'new port date',
        'vessel eta',
        'raw eta',
        'carrier eta',
        'port arrival date',
      ]);

      const portNameVal = String(
        getRowVal(row, ['port name', 'new port name', 'destination port', 'shipped to', 'port']) || ''
      ).trim();

      const remarksVal = String(
        getRowVal(row, ['remarks', 'new remarks', 'remark', 'notes', 'status remark', 'container status']) || ''
      ).trim();

      // Skip row if no container identifier provided
      if (!internalContainerVal && !actualContainerVal) {
        skippedCount++;
        continue;
      }

      const parsedEta = normalizeDate(etaDateRaw);
      const parsedPortDate = normalizeDate(portDateRaw);

      // Check if user entered invalid date in non-empty date cell
      if (etaDateRaw && !parsedEta && String(etaDateRaw).trim() !== '' && String(etaDateRaw).trim() !== '—') {
        warnings.push(`Row ${rowNum} (${internalContainerVal || actualContainerVal}): Could not parse ETA Date "${etaDateRaw}"`);
      }
      if (portDateRaw && !parsedPortDate && String(portDateRaw).trim() !== '' && String(portDateRaw).trim() !== '—') {
        warnings.push(`Row ${rowNum} (${internalContainerVal || actualContainerVal}): Could not parse Port Date "${portDateRaw}"`);
      }

      // Check if any actual update was provided for this row
      const hasAnyUpdate =
        Boolean(parsedEta) ||
        Boolean(parsedPortDate) ||
        Boolean(portNameVal) ||
        Boolean(remarksVal) ||
        Boolean(blVal) ||
        (Boolean(shippingLineVal) && shippingLineVal !== 'Default') ||
        (Boolean(actualContainerVal));

      if (!hasAnyUpdate) {
        skippedCount++;
        continue;
      }

      // Find existing container in Container collection
      const queryOr: any[] = [];
      if (internalContainerVal) {
        const escaped = internalContainerVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_\s]+/g, '[-_\\s]*');
        queryOr.push({ container: new RegExp(`^${escaped}$`, 'i') });
      }
      if (actualContainerVal) {
        const escapedAct = actualContainerVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_\s]+/g, '[-_\\s]*');
        queryOr.push({ containerNumber: new RegExp(`^${escapedAct}$`, 'i') });
      }

      let existingContainer: any = await Container.findOne({ $or: queryOr });

      // Fallback: check Shipment collection if Container collection doesn't have it yet
      if (!existingContainer) {
        const existingShipment: any = await Shipment.findOne({ $or: queryOr });
        if (existingShipment) {
          existingContainer = {
            container: existingShipment.container || internalContainerVal,
            containerNumber: existingShipment.containerNumber || actualContainerVal,
            blNumber: existingShipment.blNumber || blVal || '',
            shippingLine: existingShipment.shippingLine || shippingLineVal || 'MSC',
            shippedTo: existingShipment.shippedTo || portNameVal || 'India Port',
            destinationDate: existingShipment.destinationDate || existingShipment.eta || '',
            eta: existingShipment.eta || '',
            rawEta: existingShipment.rawEta || existingShipment.portDate || '',
            portDate: existingShipment.portDate || existingShipment.rawEta || '',
            remarks: [],
          };
        }
      }

      const effectiveAlias = internalContainerVal || existingContainer?.container || actualContainerVal;
      const effectiveActual = actualContainerVal || existingContainer?.containerNumber || '';
      const effectiveShippingLine = shippingLineVal || existingContainer?.shippingLine || 'MSC';

      // User requirement: Delivered containers are not allowed/required to be updated anymore
      if (existingContainer && isContainerDelivered(existingContainer)) {
        warnings.push(`Skipped ${effectiveAlias}: Container is already marked as Delivered. Delivered containers cannot be modified.`);
        skippedCount++;
        continue;
      }

      // Compare Previous vs New Dates to detect DATE CHANGES
      const oldEtaRaw = existingContainer?.destinationDate || existingContainer?.eta || '';
      const oldEtaNorm = normalizeDate(oldEtaRaw) || '';

      const oldPortDateRaw = existingContainer?.portDate || existingContainer?.rawEta || '';
      const oldPortDateNorm = normalizeDate(oldPortDateRaw) || '';

      let isEtaChanged = false;
      let etaDaysShift: number | null = null;
      if (parsedEta) {
        if (!oldEtaNorm || parsedEta !== oldEtaNorm) {
          isEtaChanged = true;
          etaDaysShift = oldEtaNorm ? calculateDaysBetween(oldEtaNorm, parsedEta) : null;
        }
      }

      let isPortDateChanged = false;
      let portDaysShift: number | null = null;
      if (parsedPortDate) {
        if (!oldPortDateNorm || parsedPortDate !== oldPortDateNorm) {
          isPortDateChanged = true;
          portDaysShift = oldPortDateNorm ? calculateDaysBetween(oldPortDateNorm, parsedPortDate) : null;
        }
      }

      // If either date changed, record in dateChanges list for .txt file generation
      if (isEtaChanged || isPortDateChanged) {
        dateChanges.push({
          container: effectiveAlias,
          containerNumber: effectiveActual,
          blNumber: blVal || existingContainer?.blNumber || '',
          shippingLine: effectiveShippingLine,
          portName: portNameVal || existingContainer?.shippedTo || 'India Port',
          isEtaChanged,
          oldEta: oldEtaNorm,
          newEta: parsedEta || oldEtaNorm,
          etaDaysShift,
          isPortDateChanged,
          oldPortDate: oldPortDateNorm,
          newPortDate: parsedPortDate || oldPortDateNorm,
          portDaysShift,
          remarks: remarksVal,
        });
      }

      // Prepare DB update fields
      const containerSetFields: Record<string, any> = {
        lastModifiedBy: username,
        lastModifiedByRole: userRole,
        etaUpdatedAt: now,
      };

      if (effectiveActual) containerSetFields.containerNumber = effectiveActual;
      if (blVal) containerSetFields.blNumber = blVal;
      if (effectiveShippingLine) containerSetFields.shippingLine = effectiveShippingLine;
      if (portNameVal) containerSetFields.shippedTo = portNameVal;

      if (parsedEta) {
        containerSetFields.destinationDate = parsedEta;
        containerSetFields.eta = parsedEta;
      }

      if (parsedPortDate) {
        containerSetFields.rawEta = parsedPortDate;
        containerSetFields.portDate = parsedPortDate;
      }

      let remarkToPush: any = null;
      if (remarksVal) {
        remarkToPush = {
          date: todayStr,
          remarks: remarksVal,
          createdAt: now,
          createdBy: username,
        };
      }

      // Update or create Container
      const containerUpdateOps: any = {
        $set: containerSetFields,
        $setOnInsert: {
          container: effectiveAlias,
          warehouse: 'China Warehouse',
          planStatus: 'Planning',
          isFinalized: Boolean(effectiveActual),
          allottedActualAt: effectiveActual ? now : null,
        },
      };

      if (remarkToPush) {
        containerUpdateOps.$push = { remarks: remarkToPush };
      }

      await Container.findOneAndUpdate(
        {
          $or: [
            { container: effectiveAlias },
            ...(effectiveActual ? [{ containerNumber: effectiveActual }] : []),
          ],
        },
        containerUpdateOps,
        { upsert: true, new: true }
      );

      // Also update matching Shipments
      const shipmentSetFields: Record<string, any> = { ...containerSetFields };
      delete shipmentSetFields.remarks;

      const shipmentUpdateOps: any = { $set: shipmentSetFields };
      if (remarkToPush) {
        shipmentUpdateOps.$push = { containerRemarks: remarkToPush };
      }

      await Shipment.updateMany(
        {
          $or: [
            { container: effectiveAlias },
            ...(effectiveActual ? [{ containerNumber: effectiveActual }] : []),
          ],
        },
        shipmentUpdateOps
      ).catch((err) => {
        console.error(`Error updating shipments for container ${effectiveAlias}:`, err);
      });

      // Invalidate Redis cache
      await invalidateContainerCache(effectiveAlias).catch(() => {});
      if (effectiveActual) {
        await invalidateContainerCache(effectiveActual).catch(() => {});
      }
      if (blVal) {
        await invalidateContainerCache(blVal).catch(() => {});
      }

      totalUpdated++;
      updatedContainersList.push(effectiveAlias);
    }

    // Generate .txt audit report
    const hasDateChanges = dateChanges.length > 0;
    const dateChangeReportText = generateDateChangeTxtReport(dateChanges, {
      fileName: file.name,
      username,
      role: userRole,
      totalRows: rawRows.length,
      totalUpdated,
      timestamp: now,
    });

    // Record Edit Log in MongoDB
    await recordEditLog(req, {
      action: 'UPDATE',
      entityType: 'ContainerBulkExcel',
      entityId: `Excel_${todayStr}`,
      description: `Bulk Excel update: ${totalUpdated} containers updated. ${dateChanges.length} had date changes.`,
      details: {
        fileName: file.name,
        totalRows: rawRows.length,
        totalUpdated,
        dateChangesCount: dateChanges.length,
        hasDateChanges,
        dateChanges: dateChanges.map((d) => ({
          container: d.container,
          containerNumber: d.containerNumber,
          isEtaChanged: d.isEtaChanged,
          newEta: d.newEta,
          oldEta: d.oldEta,
          isPortDateChanged: d.isPortDateChanged,
          newPortDate: d.newPortDate,
          oldPortDate: d.oldPortDate,
        })),
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: hasDateChanges
        ? `Successfully updated ${totalUpdated} container(s)! ${dateChanges.length} container(s) had date modifications.`
        : `Successfully updated ${totalUpdated} container(s)! No date changes were detected.`,
      totalRows: rawRows.length,
      totalUpdated,
      skippedCount,
      hasDateChanges,
      dateChangesCount: dateChanges.length,
      dateChanges,
      dateChangeReportText,
      warnings,
      updatedContainers: updatedContainersList,
    });
  } catch (err: any) {
    console.error('Error during container bulk excel upload:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process container bulk update Excel' },
      { status: 500 }
    );
  }
}
