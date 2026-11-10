const fs = require('fs');

const p = 'C:/Users/USER/Desktop/New folder/anti/app/track/[token]/page.tsx';
let content = fs.readFileSync(p, 'utf8');

// 1. IPublicReceipt: add warehouse?: string;
if (!content.includes('warehouse?: string; // Origin warehouse')) {
  content = content.replace(
    '  receiptNo: string;\n  itemName: string;',
    '  receiptNo: string;\n  warehouse?: string; // Origin warehouse e.g. "GZ", "YW"\n  itemName: string;'
  );
  if (!content.includes('warehouse?: string; // Origin warehouse')) {
    content = content.replace(
      '  receiptNo: string;\r\n  itemName: string;',
      '  receiptNo: string;\r\n  warehouse?: string; // Origin warehouse e.g. "GZ", "YW"\r\n  itemName: string;'
    );
  }
}

// 2. Search filter: include r.warehouse
content = content.replace(
  'const fullText = `${r.marka || \'\'} ${r.receiptNo || \'\'} ${r.itemName || \'\'}',
  'const fullText = `${r.marka || \'\'} ${r.receiptNo || \'\'} ${r.warehouse || \'\'} ${r.itemName || \'\'}'
);

// 3. Card View: add warehouse badge next to receipt button
const cardTarget = `                          <button
                            type="button"
                            onClick={() => openQueryModal(r.receiptNo)}
                            style={{
                              backgroundColor: colorTheme.pillBg,
                              borderColor: colorTheme.pillBorder,
                              color: colorTheme.pillText
                            }}
                            className="inline-flex items-center gap-1 font-mono font-black border px-2 py-0.5 rounded-md text-xs cursor-pointer hover:opacity-80 transition"
                          >
                            <span className={\`w-1.5 h-1.5 rounded-full \${colorTheme.dotBg} inline-block shrink-0\`} />
                            <span>#{r.receiptNo}</span>
                          </button>`;

const cardReplacement = `                          <button
                            type="button"
                            onClick={() => openQueryModal(r.receiptNo)}
                            style={{
                              backgroundColor: colorTheme.pillBg,
                              borderColor: colorTheme.pillBorder,
                              color: colorTheme.pillText
                            }}
                            className="inline-flex items-center gap-1 font-mono font-black border px-2 py-0.5 rounded-md text-xs cursor-pointer hover:opacity-80 transition"
                          >
                            <span className={\`w-1.5 h-1.5 rounded-full \${colorTheme.dotBg} inline-block shrink-0\`} />
                            <span>#{r.receiptNo}</span>
                          </button>
                          {r.warehouse && (
                            <span className="font-bold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded text-[10px] uppercase">
                              {r.warehouse} WH
                            </span>
                          )}`;

content = content.replace(cardTarget.replace(/\r?\n/g, '\r\n'), cardReplacement.replace(/\r?\n/g, '\r\n'));
if (!content.includes('{r.warehouse} WH</span>')) {
  content = content.replace(cardTarget.replace(/\r?\n/g, '\n'), cardReplacement.replace(/\r?\n/g, '\n'));
}

// 4. Table View: add warehouse badge next to r.receiptNo
const tableTarget = `                          <span className={\`w-2 h-2 rounded-full \${colorTheme.dotBg} inline-block shrink-0\`} />
                          <Package className="w-3.5 h-3.5 opacity-80 group-hover:scale-110 transition-transform" />
                          <span>{r.receiptNo}</span>`;

const tableReplacement = `                          <span className={\`w-2 h-2 rounded-full \${colorTheme.dotBg} inline-block shrink-0\`} />
                          <Package className="w-3.5 h-3.5 opacity-80 group-hover:scale-110 transition-transform" />
                          <span>{r.receiptNo}</span>
                          {r.warehouse && (
                            <span className="text-[10px] font-bold bg-white/90 border border-current px-1.5 py-0.2 rounded ml-1 uppercase">
                              {r.warehouse} WH
                            </span>
                          )}`;

content = content.replace(tableTarget.replace(/\r?\n/g, '\r\n'), tableReplacement.replace(/\r?\n/g, '\r\n'));
if (!content.includes('bg-white/90 border border-current px-1.5 py-0.2 rounded ml-1 uppercase')) {
  content = content.replace(tableTarget.replace(/\r?\n/g, '\n'), tableReplacement.replace(/\r?\n/g, '\n'));
}

// 5. PDF & Excel export: include warehouse tag
content = content.replace(
  'r.receiptNo || \'-\',\n          r.marka || linkName || \'-\',',
  '(r.receiptNo ? (r.warehouse ? `${r.receiptNo} (${r.warehouse} WH)` : r.receiptNo) : \'-\'),\n          r.marka || linkName || \'-\','
);
content = content.replace(
  'r.receiptNo || \'-\',\r\n          r.marka || linkName || \'-\',',
  '(r.receiptNo ? (r.warehouse ? `${r.receiptNo} (${r.warehouse} WH)` : r.receiptNo) : \'-\'),\r\n          r.marka || linkName || \'-\','
);

// 6. Modal note update
content = content.replace(
  'Enter your <strong>Receipt Number</strong> and the exact <strong>Carton Count (CTN)</strong> as written on your warehouse slip. If both parameters match our records, the shipment will be added to your tracking link immediately.',
  'Enter your <strong>Receipt Number</strong> and the exact <strong>Carton Count (CTN)</strong> as written on your warehouse slip. Since receipts can be issued across different China warehouses (e.g. Guangzhou vs Yiwu), Carton Count ensures your exact warehouse receipt is verified and linked.'
);

fs.writeFileSync(p, content, 'utf8');
console.log('Updated app/track/[token]/page.tsx successfully');
