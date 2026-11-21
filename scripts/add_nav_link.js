const fs = require('fs');
const path = require('path');

const adminPagePath = path.join(__dirname, '..', 'app', 'admin', 'page.tsx');
let content = fs.readFileSync(adminPagePath, 'utf8');

const target = '<span>Dispatcher (डिस्पैचर)</span>';
if (!content.includes('href="/sales"')) {
  const linkJsx = `

            <Link
              href="/sales"
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold border border-purple-300 transition flex items-center space-x-1"
              title="Sales Head and Sales Team Portal"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
              <span>Sales Portal (सेल्स हेड)</span>
            </Link>`;

  const dispatcherBlockIndex = content.indexOf(target);
  if (dispatcherBlockIndex !== -1) {
    const linkCloseIndex = content.indexOf('</Link>', dispatcherBlockIndex);
    if (linkCloseIndex !== -1) {
      const insertPos = linkCloseIndex + '</Link>'.length;
      content = content.slice(0, insertPos) + linkJsx + content.slice(insertPos);
      fs.writeFileSync(adminPagePath, content, 'utf8');
      console.log('Successfully added /sales link to app/admin/page.tsx');
    }
  }
} else {
  console.log('/sales link already present in app/admin/page.tsx');
}
