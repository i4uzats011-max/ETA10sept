'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchGraphQL } from '@/lib/graphql';
import { formatGlobalDate } from '@/lib/dateUtils';
import {
  Package,
  Truck,
  Search,
  Calendar,
  Layers,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  FileText,
  Weight,
  Box,
  Phone,
  Mail,
  HelpCircle,
  Ship,
  Plane,
  Globe,
  CheckCircle2,
  Anchor,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Star,
  Users,
  Award,
  ArrowRight,
  TrendingUp,
  Compass,
  Printer,
  Download,
} from 'lucide-react';

function formatCBM(volume: any): string {
  if (volume === null || volume === undefined || volume === '' || volume === 'N/A') {
    return 'N/A';
  }
  const clean = String(volume).replace(/cbm|m3/gi, '').trim();
  const num = parseFloat(clean);
  if (!isNaN(num)) {
    if (clean.includes('.')) {
      return `${clean} CBM`;
    }
    return `${num.toFixed(2)} CBM`;
  }
  return `${volume} CBM`;
}

export default function PublicTrackerPage() {
  const [activeTab, setActiveTab] = useState<'receipt' | 'container'>('receipt');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Download & Print Sanitized PDF Receipt (ZERO carrier details exposed)
  const downloadReceiptPDF = (receiptNumber: string, shipments: any[]) => {
    if (!shipments || shipments.length === 0) return;
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const primary = shipments[0];

      // Navy Blue Header Banner
      doc.setFillColor(11, 25, 44);
      doc.rect(0, 0, 210, 32, 'F');

      // Title & Company Contact Info
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('US INTERNATIONAL LOGISTICS', 14, 13);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('China to India Freight & Cargo Forwarding Solutions', 14, 19);
      doc.text('Phone: +91 9355456060   |   Email: info@usinternationallogistics.com   |   Delhi, India', 14, 25);

      // Red Accent Divider
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 32, 210, 2, 'F');

      // Document Header
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('CARGO RECEIPT & DELIVERY CONFIRMATION SLIP', 14, 43);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${new Date().toLocaleString()}   |   Total Cargo Items: ${shipments.length}`, 14, 49);

      // Summary Overview Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 53, 182, 42, 3, 3, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Receipt Number:', 18, 61);
      doc.setFont('helvetica', 'normal');
      doc.text(String(receiptNumber || primary.receipt), 50, 61);

      doc.setFont('helvetica', 'bold');
      doc.text('Container Alias:', 110, 61);
      doc.setFont('helvetica', 'normal');
      doc.text(String(primary.container || 'N/A'), 145, 61);

      doc.setFont('helvetica', 'bold');
      doc.text('Receipt Date:', 18, 69);
      doc.setFont('helvetica', 'normal');
      doc.text(String(formatGlobalDate(primary.date)), 50, 69);

      doc.setFont('helvetica', 'bold');
      doc.text('Expected Delivery (ETA):', 110, 69);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38); // Highlight ETA in Red
      doc.text(String(formatGlobalDate(primary.eta) || 'Pending'), 155, 69);
      doc.setTextColor(15, 23, 42);

      doc.setFont('helvetica', 'bold');
      doc.text('Loading Warehouse:', 18, 77);
      doc.setFont('helvetica', 'normal');
      doc.text(String(primary.warehouse || 'China Warehouse'), 50, 77);

      doc.setFont('helvetica', 'bold');
      doc.text('Delivery Warehouse:', 110, 77);
      doc.setFont('helvetica', 'normal');
      doc.text(String(primary.warehouseEntry || 'India Delivery Warehouse'), 145, 77);

      doc.setFont('helvetica', 'bold');
      doc.text('Cargo Marks:', 18, 85);
      doc.setFont('helvetica', 'normal');
      const marksStr = [primary.mainMarka ? `Main: ${primary.mainMarka}` : '', (primary.subMarka && primary.subMarka !== '??') ? `Sub: ${primary.subMarka}` : ''].filter(Boolean).join(' | ') || 'N/A';
      doc.text(marksStr, 50, 85);

      // Manifest Table
      const headers = ['#', 'Item / Commodity Name', 'Cargo Marks', 'Cartons (Qty)', 'Weight (KG)', 'Volume (CBM)', 'Loading Warehouse', 'Expected ETA'];
      const body = shipments.map((s, idx) => [
        idx + 1,
        s.english || s.commodity || 'General Cargo',
        [s.mainMarka ? `M:${s.mainMarka}` : '', (s.subMarka && s.subMarka !== '??') ? `S:${s.subMarka}` : ''].filter(Boolean).join(' ') || 'N/A',
        `${s.quantity || s.cartons || '0'} CTN`,
        s.weight ? `${s.weight} KG` : 'N/A',
        formatCBM(s.volume),
        s.warehouse || 'China WH',
        formatGlobalDate(s.eta) || 'Pending',
      ]);

      autoTable(doc, {
        head: [headers],
        body: body,
        startY: 100,
        theme: 'grid',
        headStyles: { fillColor: [11, 25, 44], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 150;

      // Note & Confidentiality Disclaimer
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'italic');
      doc.text(
        'Note: Official cargo tracking slip. Expected delivery dates include standard port customs clearance turnaround.',
        14,
        finalY + 10
      );
      doc.text(
        'For delivery inquiries or support, please contact +91 9355456060 or info@usinternationallogistics.com.',
        14,
        finalY + 15
      );

      doc.save(`USI_Receipt_${receiptNumber || 'Cargo'}.pdf`);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      alert('Unable to generate PDF: ' + (err?.message || 'Error occurred'));
    }
  };

  // Results state
  const [receiptResult, setReceiptResult] = useState<any | null>(null);
  const [containerResult, setContainerResult] = useState<any | null>(null);

  // FAQ Accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setReceiptResult(null);
    setContainerResult(null);

    const queryInput = searchQuery.trim();

    try {
      if (activeTab === 'receipt') {
        const gqlQuery = `
          query TrackReceipt($receipt: String!) {
            trackByReceipt(receipt: $receipt) {
              success
              count
              receipt
              isSplit
              warehouseReceipt {
                id
                receipt
                warehouse
                warehouseEntry
                date
                quantity
                loadedQuantity
                remainingQuantity
                commodity
                chinese
                english
                status
              }
              shipments {
                id
                receipt
                container
                english
                chinese
                commodity
                quantity
                weight
                volume
                date
                warehouseEntry
                warehouse
                stockstatus
                packaging
                subMarka
                mainMarka
                status
                eta
                isSplit
                splitIndex
                originalTotalQuantity
                lastApiSync
              }
            }
          }
        `;

        const response = await fetchGraphQL(gqlQuery, { receipt: queryInput });

        if (response.errors && response.errors.length > 0) {
          const res = await fetch(`/api/track/receipt?receipt=${encodeURIComponent(queryInput)}`);
          const data = await res.json();
          if (res.ok && ((data.shipments && data.shipments.length > 0) || data.warehouseReceipt)) {
            setReceiptResult(data);
          } else {
            // Smart Fallback: Check if user entered a container alias/number while on receipt tab
            const containerRes = await fetch(`/api/track/container?container=${encodeURIComponent(queryInput)}`);
            const cData = await containerRes.json();
            if (containerRes.ok && cData.container) {
              setActiveTab('container');
              setContainerResult(cData);
            } else {
              throw new Error(data.error || response.errors[0].message);
            }
          }
        } else if (response.data?.trackByReceipt) {
          setReceiptResult(response.data.trackByReceipt);
        }
      } else {
        const gqlQuery = `
          query TrackContainer($container: String!) {
            trackByContainer(container: $container) {
              success
              container
              eta
              status
              shippedFrom
              shippedTo
              currentLocation
              startDate
              destinationDate
              vesselName
              voyageNumber
              formattedArrivalMessage
              daysRemaining
              shipments {
                id
                receipt
                english
                commodity
                quantity
                weight
                volume
                status
              }
            }
          }
        `;

        const response = await fetchGraphQL(gqlQuery, { container: queryInput });

        if (response.errors && response.errors.length > 0) {
          const res = await fetch(`/api/track/container?container=${encodeURIComponent(queryInput)}`);
          const data = await res.json();
          if (res.ok && data.container) {
            setContainerResult(data);
          } else {
            // Smart Fallback: Check if user entered a receipt number while on container tab
            const receiptRes = await fetch(`/api/track/receipt?receipt=${encodeURIComponent(queryInput)}`);
            const rData = await receiptRes.json();
            if (receiptRes.ok && rData.shipments && rData.shipments.length > 0) {
              setActiveTab('receipt');
              setReceiptResult(rData);
            } else {
              throw new Error(data.error || response.errors[0].message);
            }
          }
        } else if (response.data?.trackByContainer) {
          setContainerResult(response.data.trackByContainer);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected tracking error occurred');
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  };

  const receiptShipmentsList = receiptResult?.shipments || [];
  const distinctContainers = Array.from(new Set(receiptShipmentsList.map((s: any) => s.container).filter(Boolean)));


  const faqs = [
    {
      q: 'How does the container arrival date calculation work?',
      a: 'For live carrier APIs, an automated +7 days filing buffer is included to account for customs clearance and container terminal processing in India. If the ETA date is explicitly defined by our admin team, the exact actual date set by the admin is displayed directly.',
    },
    {
      q: 'Can I track multiple cargo packages with a single Receipt Number?',
      a: 'Yes! Importers frequently clear multiple goods under the same receipt. Entering your Receipt / Bill Number will display all associated cargo items across all containers.',
    },
    {
      q: 'Why is the carrier container number masked on public tracking?',
      a: 'To maintain confidentiality and prevent un-authorized bill of lading queries, raw carrier container numbers are masked on public searches while showing your custom public container alias (e.g., USI-01).',
    },
    {
      q: 'What shipping lines are supported by JSONCargo real-time API?',
      a: 'Our API engine supports major ocean shipping lines including MSC, Maersk, HMM (Hyundai Merchant Marine), Hapag-Lloyd, COSCO, ONE, Evergreen, CMA CGM, Zim, Yang Ming, and PIL.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800 font-sans">
      {/* 1. Top Contact & Utility Bar (US International Logistics Theme) */}
      <div className="bg-slate-950 text-slate-300 border-b border-slate-800 text-xs py-2 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-6">
            <a href="tel:09355456060" className="flex items-center space-x-1.5 hover:text-red-400 transition font-semibold">
              <Phone className="w-3.5 h-3.5 text-red-500" />
              <span>+91 9355456060</span>
            </a>
            <a href="mailto:info@usinternationallogistics.com" className="flex items-center space-x-1.5 hover:text-red-400 transition font-semibold">
              <Mail className="w-3.5 h-3.5 text-red-500" />
              <span>info@usinternationallogistics.com</span>
            </a>
            <div className="hidden md:flex items-center space-x-1.5 text-slate-400 font-medium">
              <MapPin className="w-3.5 h-3.5 text-amber-500" />
              <span>Sector-7, Rohini West, New Delhi - 110085</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="bg-red-600/20 text-red-400 border border-red-500/30 px-2.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1">
              <Globe className="w-3 h-3 text-red-400" />
              <span>China to India Logistics Specialist</span>
            </span>
            <Link href="/admin/login" className="flex items-center space-x-1 hover:text-white transition font-bold text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin Portal</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-red-600 p-2.5 rounded-2xl text-white shadow-md shadow-red-600/20">
              <Ship className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-black text-xl tracking-tight text-slate-950">US INTERNATIONAL</span>
                <span className="font-black text-xl tracking-tight text-red-600">LOGISTICS</span>
              </div>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                China to India Cargo & Freight Solutions
              </p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center space-x-8 text-sm font-bold text-slate-700">
            <a href="#tracking" className="text-red-600 font-black hover:text-red-700 transition">Track Order</a>
            <a href="#services" className="hover:text-red-600 transition">Services</a>
            <a href="#process" className="hover:text-red-600 transition">Working Process</a>
            <a href="#reviews" className="hover:text-red-600 transition">Customer Reviews</a>
            <a href="#faq" className="hover:text-red-600 transition">FAQs</a>
          </nav>

          <div className="flex items-center space-x-3">
            <Link
              href="/admin/login"
              className="px-5 py-2.5 rounded-2xl bg-slate-950 hover:bg-red-600 text-white font-bold text-xs tracking-wide transition shadow-md flex items-center space-x-2"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Admin Sign In</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. Hero Section with Graphics & Image Cards */}
      <main className="flex-1 space-y-16 pb-16">
        <section id="tracking" className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white py-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800 overflow-hidden">
          {/* Background Glow Effects */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
            {/* Left Column: Hero Content & Search Box */}
            <div className="lg:col-span-7 space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-red-600/20 border border-red-500/30 text-red-300 text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-red-400" />
                  <span>Real-Time China to India Freight Tracking</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                  Seamless Ocean & Air Cargo Tracking
                </h1>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                  Track your cargo receipts and container arrival dates instantly. Search by Receipt number for complete consignment details, or Container number to check its ETA directly.
                </p>
              </div>

              {/* Interactive Search Card */}
              <div className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2">
                  <button
                    onClick={() => {
                      setActiveTab('receipt');
                      setError(null);
                      setReceiptResult(null);
                      setContainerResult(null);
                      setSearchQuery('');
                    }}
                    className={`flex-1 py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition ${
                      activeTab === 'receipt'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Search by Receipt (Bill No)</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('container');
                      setError(null);
                      setReceiptResult(null);
                      setContainerResult(null);
                      setSearchQuery('');
                    }}
                    className={`flex-1 py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition ${
                      activeTab === 'container'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <Box className="w-4 h-4" />
                    <span>Search by Container Alias</span>
                  </button>
                </div>

                {/* Search Form */}
                <form onSubmit={handleSearch} className="p-6 sm:p-8 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      {activeTab === 'receipt'
                        ? 'Enter Receipt Number (e.g., REC-1002)'
                        : 'Enter Container ID (e.g., USI-01)'}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                          activeTab === 'receipt'
                            ? 'Enter Receipt Number (e.g., REC-1002)...'
                            : 'Enter Container ID (e.g., USI-01)...'
                        }
                        className="w-full pl-12 pr-36 py-4 rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent text-base font-semibold text-slate-900 placeholder-slate-400 bg-slate-50"
                        required
                      />
                      <div className="absolute left-4 text-slate-400 pointer-events-none">
                        <Search className="w-5 h-5 text-red-600" />
                      </div>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="absolute right-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition shadow-md shadow-red-600/20 disabled:opacity-50 flex items-center space-x-2"
                      >
                        {isLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Searching...</span>
                          </>
                        ) : (
                          <span>Track Status</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start space-x-3 text-red-700 text-sm animate-fadeIn">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Tracking Query Error</p>
                        <p className="text-red-600 text-xs mt-0.5">{error}</p>
                      </div>
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Right Column: Hero Graphic Visual Image */}
            <div className="lg:col-span-5 relative flex justify-center">
              <div className="relative w-full max-w-lg bg-slate-900/80 border border-slate-800 rounded-3xl p-4 shadow-2xl group overflow-hidden">
                <img
                  src="/images/hero-ship.svg"
                  alt="China to India Ocean Container Ship"
                  className="w-full h-auto rounded-2xl object-cover transform group-hover:scale-105 transition duration-500"
                />
                <div className="absolute bottom-6 left-6 right-6 bg-slate-950/90 backdrop-blur-md p-4 rounded-2xl border border-slate-800 text-white flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-red-400 tracking-wider">China → India Route</span>
                    <p className="text-xs font-bold text-slate-200">Ocean Vessel Carrier Live Status</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500 text-white">
                    API Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Counter Statistics Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-3xl sm:text-4xl font-black text-red-600 font-mono">10,000+</div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Containers Handled</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-3xl sm:text-4xl font-black text-slate-900 font-mono">15+ Years</div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Industry Experience</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-3xl sm:text-4xl font-black text-red-600 font-mono">99.8%</div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Customs Success</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <div className="text-3xl sm:text-4xl font-black text-slate-900 font-mono">24/7</div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Live Tracking Engine</p>
            </div>
          </div>
        </section>

        {/* 5. Receipt & Container Search Results */}
        <div id="results-section" className="space-y-8">
          {/* Warehouse Received In Stock (Cargo in China Warehouse - Loading Plan Pending) */}
          {activeTab === 'receipt' && receiptResult?.warehouseReceipt && receiptShipmentsList.length === 0 && (
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 animate-fadeIn">
              <div className="bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 border-2 border-blue-200 p-6 rounded-3xl shadow-md space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-100 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm">
                      <Package className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                        Cargo Safely Received in China
                      </span>
                      <h3 className="text-xl font-black text-slate-900 font-mono mt-1">
                        Receipt: {receiptResult.receipt}
                      </h3>
                    </div>
                  </div>

                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Loading Plan In Progress</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="bg-white/80 p-3.5 rounded-2xl border border-blue-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Receiving Warehouse</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5 flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>{receiptResult.warehouseReceipt.warehouse || 'China Warehouse'}</span>
                    </div>
                  </div>

                  <div className="bg-white/80 p-3.5 rounded-2xl border border-blue-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Received Date</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">
                      {formatGlobalDate(receiptResult.warehouseReceipt.date) || receiptResult.warehouseReceipt.date || 'Recent'}
                    </div>
                  </div>

                  <div className="bg-white/80 p-3.5 rounded-2xl border border-blue-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Inward Quantity</span>
                    <div className="font-black text-blue-700 text-sm mt-0.5">
                      {receiptResult.warehouseReceipt.quantity} CTN / Packages
                    </div>
                  </div>

                  <div className="bg-white/80 p-3.5 rounded-2xl border border-blue-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Commodity</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5 truncate" title={receiptResult.warehouseReceipt.english || receiptResult.warehouseReceipt.commodity}>
                      {receiptResult.warehouseReceipt.english || receiptResult.warehouseReceipt.commodity || 'General Cargo'}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 bg-white/60 p-3 rounded-xl border border-blue-100/50">
                  ℹ️ Your goods have been safely unloaded and verified at our China warehouse. Our logistics loaders are currently creating the loading plan and internal container allotment. Once container loading and customs filing are finalized, the sea transit ETA will be updated automatically.
                </p>
              </div>
            </section>
          )}

          {activeTab === 'receipt' && receiptShipmentsList.length > 0 && (
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-red-950 shadow-sm">
                <span className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-red-600" />
                  <span>Receipt Number: <strong className="font-mono text-sm text-slate-950">{receiptResult.receipt}</strong></span>
                </span>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => downloadReceiptPDF(receiptResult.receipt, receiptShipmentsList)}
                    className="px-4 py-2 bg-slate-900 hover:bg-red-600 text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Download / Print PDF Receipt</span>
                  </button>
                  <span className="bg-red-600 text-white px-3 py-1 rounded-full font-bold">
                    Found {receiptShipmentsList.length} cargo record(s)
                  </span>
                </div>
              </div>

              {/* Split Cargo Shipment Notice (When Receipt spans 2 or more containers) */}
              {distinctContainers.length > 1 && (
                <div className="bg-gradient-to-r from-amber-50 via-amber-100/70 to-orange-50 border-2 border-amber-300 p-5 rounded-3xl shadow-md space-y-3 animate-fadeIn">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-amber-500 text-white rounded-xl shadow-sm">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-amber-950 tracking-tight">
                        Split Cargo Shipment: Found Across {distinctContainers.length} Containers
                      </h4>
                      <p className="text-xs text-amber-800">
                        Goods under receipt <strong className="font-mono">{receiptResult.receipt}</strong> are loaded across multiple containers. Each container delivery date is detailed below:
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                    {distinctContainers.map((containerName: any) => {
                      const containerItems = receiptShipmentsList.filter((s: any) => s.container === containerName);
                      const primary = containerItems[0];
                      return (
                        <div
                          key={containerName}
                          className="bg-white/90 backdrop-blur-sm p-3.5 rounded-2xl border border-amber-200 shadow-sm flex flex-col justify-between space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-black text-sm text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                              {containerName}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 uppercase">
                              Scheduled Delivery
                            </span>
                          </div>
                          <div className="text-xs space-y-1 text-slate-600">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-500 font-medium">Expected Delivery:</span>
                              <strong className="text-red-700 font-mono text-xs">{formatGlobalDate(primary?.eta) || 'Pending'}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-500 font-medium">Cargo Items:</span>
                              <span className="font-bold text-slate-800">{containerItems.length} package(s)</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {receiptShipmentsList.map((item: any, idx: number) => {
                const isItemDelivered = item.status === 'Delivered';
                return (
                <div key={item.id || idx} className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden space-y-6 animate-fadeIn">
                  {/* Header Banner */}
                  <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-6 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
                    <div>
                      <span className="text-xs uppercase font-bold text-red-400 tracking-wider">Cargo Item #{idx + 1} • Receipt {item.receipt}</span>
                      <h3 className="text-2xl font-black font-mono tracking-tight mt-0.5 text-white">{item.receipt}</h3>
                      <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-2">
                        <span className="flex items-center space-x-1.5">
                          <Box className="w-4 h-4 text-amber-400" />
                          <span>Container:</span>
                        </span>
                        <strong className="text-amber-300 font-mono bg-slate-800 px-2.5 py-0.5 rounded text-xs border border-amber-500/40">
                          {item.container}
                        </strong>
                        {distinctContainers.length > 1 && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                            Container {distinctContainers.indexOf(item.container) + 1} of {distinctContainers.length}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      {/* Prominent Header Delivery Date Badge (ETA + 10 Days) */}
                      <div className="flex items-center space-x-2 text-white px-4 py-2 rounded-xl border shadow-sm bg-gradient-to-r from-red-600 to-rose-600 border-red-400/40">
                        <Clock className="w-4 h-4 text-amber-300" />
                        <div>
                          <span className="text-[9px] uppercase font-bold text-rose-200 block">
                            Date of Delivery (ETA + 10 Days)
                          </span>
                          <span className="text-sm font-black font-mono text-white">
                            {item.dateOfDelivery || formatGlobalDate(item.eta) || 'Pending'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => downloadReceiptPDF(item.receipt, [item])}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-red-600 text-white text-xs font-bold transition flex items-center space-x-1.5 border border-slate-700 shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>Print PDF Slip</span>
                      </button>
                    </div>
                  </div>

                  {/* Content Details Grid - ALL Details for this Receipt */}
                  <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* 1. Large High-Visibility Delivery Date Banner (ETA + 10 Days) */}
                    <div className="text-white p-5 rounded-2xl shadow-md col-span-1 md:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-4 border-2 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 border-red-400/40 animate-fadeIn">
                      <div className="flex items-center space-x-3.5">
                        <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                          <Clock className="w-7 h-7 text-amber-300" />
                        </div>
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-200 block">
                            Expected Date of Delivery (ETA + 10 Days)
                          </span>
                          <h4 className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
                            {item.dateOfDelivery || (item.eta && item.eta !== 'N/A' && item.eta !== 'Pending' ? formatGlobalDate(item.eta) : 'Pending Confirmation')}
                          </h4>
                        </div>
                      </div>
                      <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20 text-xs font-bold flex items-center space-x-2">
                        <span className="text-rose-200">Container Alias:</span>
                        <span className="font-mono text-amber-300 font-black">{item.container}</span>
                      </div>
                    </div>

                    {/* 2. Item Description & English Commodity Name */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 col-span-1 md:col-span-2 lg:col-span-3 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase text-slate-500 tracking-wider">Item Name / Commodity</span>
                        <span className="px-3 py-1 rounded-lg bg-slate-900 text-white font-black text-xs tracking-wide shadow-sm flex items-center space-x-1 border border-slate-800">
                          <span className="text-red-400 font-bold uppercase">English Name:</span>
                          <span className="font-mono text-amber-300 font-bold text-xs">{item.commodity || item.english || 'General Cargo'}</span>
                        </span>
                      </div>
                      <p className="text-xl font-black text-slate-900 leading-snug">
                        {item.english || item.commodity || 'General Cargo'}
                      </p>
                    </div>

                    {/* 3. Cargo Marks: Main Mark & Sub Mark Badges */}
                    <div className="bg-amber-50/70 p-4.5 rounded-2xl border-2 border-amber-200 col-span-1 md:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3 sm:gap-6">
                      <span className="text-xs font-black uppercase text-amber-900 tracking-wider flex items-center space-x-1.5">
                        <Star className="w-4 h-4 text-amber-600 fill-amber-500" />
                        <span>Cargo Marks:</span>
                      </span>
                      <div className="flex items-center space-x-2 bg-amber-100/90 text-amber-950 px-3.5 py-1.5 rounded-xl border border-amber-300 text-xs font-bold">
                        <span className="text-amber-700 font-semibold">Main Mark:</span>
                        <strong className="font-mono text-slate-900">{item.mainMarka || 'N/A'}</strong>
                      </div>
                      <div className="flex items-center space-x-2 bg-blue-100/90 text-blue-950 px-3.5 py-1.5 rounded-xl border border-blue-300 text-xs font-bold">
                        <span className="text-blue-700 font-semibold">Sub Mark:</span>
                        <strong className="font-mono text-slate-900">{item.subMarka && item.subMarka !== '??' ? item.subMarka : 'N/A'}</strong>
                      </div>
                    </div>

                    {/* 4. Receipt Date (Booking / Entry Date) */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 flex items-center space-x-3">
                      <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">Receipt Date</span>
                        <p className="text-lg font-black text-slate-950 font-mono">{formatGlobalDate(item.date)}</p>
                        <span className="text-xs text-slate-400 font-medium">Receipt booking date</span>
                      </div>
                    </div>

                    {/* 5. Volume in CBM (Show decimal point e.g., 1.45 CBM) */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 flex items-center space-x-3">
                      <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">Volume (CBM)</span>
                        <p className="text-xl font-black text-slate-950 font-mono">
                          {formatCBM(item.volume)}
                        </p>
                        <span className="text-xs text-slate-400 font-medium">Cubic meters (decimal)</span>
                      </div>
                    </div>

                    {/* 6. Quantity - Kitne Carton Hain / Packets */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 flex items-center space-x-3">
                      <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">Cartons / Packets (Qty)</span>
                        <p className="text-xl font-black text-slate-950">
                          {item.quantity || item.cartons || '0'} Cartons
                        </p>
                        <span className="text-xs text-slate-500 font-semibold">
                          ({item.packaging || 'Cartons / Packets'})
                        </span>
                      </div>
                    </div>

                    {/* 7. Gross Weight in KG */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 flex items-center space-x-3">
                      <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                        <Weight className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">Gross Weight</span>
                        <p className="text-xl font-black text-slate-950">
                          {item.weight || 'N/A'} {item.weight && !String(item.weight).toLowerCase().includes('kg') ? 'KG' : ''}
                        </p>
                        <span className="text-xs text-slate-400 font-medium">Gross weight</span>
                      </div>
                    </div>

                    {/* 8. Loading Warehouse (Kis warehouse se chala hai) */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 flex items-center space-x-3">
                      <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">Loading Warehouse</span>
                        <p className="text-base font-black text-slate-900">{item.warehouse || 'China Warehouse'}</p>
                        <span className="text-xs text-slate-500 font-medium">Dispatched from origin</span>
                      </div>
                    </div>

                    {/* 9. Receiving Warehouse / Warehouse Entry (Kis warehouse mein hai) */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 flex items-center space-x-3">
                      <div className="p-3 bg-teal-100 text-teal-600 rounded-xl">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">Warehouse Entry / Destination</span>
                        <p className="text-base font-black text-slate-900">{item.warehouseEntry || 'India Delivery Warehouse'}</p>
                        <span className="text-xs text-slate-500 font-medium">CFS / Entry destination</span>
                      </div>
                    </div>

                    {/* Stock Status */}
                    {item.stockstatus && (
                      <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 flex items-center space-x-3">
                        <div className="p-3 bg-violet-100 text-violet-600 rounded-xl">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-500 uppercase">Stock Status</span>
                          <p className="text-base font-bold text-slate-900">{item.stockstatus}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </section>
          )}

          {/* 6. Container Search Results (CONTAINER ALIAS AND DATE OF DELIVERY (ETA + 10 DAYS) ONLY) */}
          {activeTab === 'container' && containerResult && (
            <section className="max-w-md mx-auto px-4 sm:px-6 space-y-4">
              <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden p-8 space-y-6 text-center animate-fadeIn">
                <div className="space-y-1">
                  <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Container Alias</span>
                  <div className="text-3xl font-black font-mono text-slate-950">
                    {containerResult.container}
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-slate-900 text-white space-y-2 border border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Date of Delivery (ETA + 10 Days)
                  </span>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-amber-300">
                    {containerResult.dateOfDelivery || formatGlobalDate(containerResult.eta) || 'Pending'}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Estimated final arrival date including 10 days port terminal clearance buffer.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* 7. Image-Rich Core Services Section */}
        <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold uppercase tracking-wider">
              <span>China to India Trade Solutions</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Our Specialized Freight Services
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm">
              End-to-end international logistics solutions tailored for seamless transportation from Chinese factories to Indian ports and warehouses.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Service Card 1 */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition duration-300 flex flex-col group">
              <div className="h-48 overflow-hidden bg-slate-900 relative">
                <img
                  src="/images/hero-ship.svg"
                  alt="Freight Forwarding Sea"
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">海运物流</span>
                  <h3 className="font-extrabold text-lg text-slate-900">Freight Forwarding (Sea)</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Expert FCL, LCL, and Break Bulk bookings with MSC, Maersk, HMM, and COSCO. Port-to-port and door-to-door delivery.
                  </p>
                </div>
                <div className="text-xs font-bold text-red-600 flex items-center space-x-1">
                  <span>Ocean Logistics</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Service Card 2 */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition duration-300 flex flex-col group">
              <div className="h-48 overflow-hidden bg-slate-900 relative">
                <img
                  src="/images/air-freight.svg"
                  alt="Freight Forwarding Air"
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">空运专线</span>
                  <h3 className="font-extrabold text-lg text-slate-900">Freight Forwarding (Air)</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Fast express air cargo shipments connecting Guangzhou, Shenzhen, and Shanghai to Delhi (DEL) and Mumbai (BOM).
                  </p>
                </div>
                <div className="text-xs font-bold text-red-600 flex items-center space-x-1">
                  <span>Air Express</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Service Card 3 */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition duration-300 flex flex-col group">
              <div className="h-48 overflow-hidden bg-slate-900 relative">
                <img
                  src="/images/china-sourcing.svg"
                  alt="China Sourcing & Direct Purchasing"
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">中国直采</span>
                  <h3 className="font-extrabold text-lg text-slate-900">Direct From China</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Trusted sourcing platform offering factory verification, white labeling, quality inspection, and sample testing.
                  </p>
                </div>
                <div className="text-xs font-bold text-red-600 flex items-center space-x-1">
                  <span>Factory Verification</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Service Card 4 */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition duration-300 flex flex-col group">
              <div className="h-48 overflow-hidden bg-slate-900 relative">
                <img
                  src="/images/warehouse.svg"
                  alt="Customs Clearance & Warehousing"
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">双清包税</span>
                  <h3 className="font-extrabold text-lg text-slate-900">Customs Clearance</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Smooth handling of import/export documentation, customs duty filing, and safe warehousing in India and China.
                  </p>
                </div>
                <div className="text-xs font-bold text-red-600 flex items-center space-x-1">
                  <span>Duty & Compliance</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 8. China-India Trade Route Graphic Section */}
        <section className="bg-slate-950 text-white py-16 px-4 sm:px-6 lg:px-8 border-t border-b border-slate-800">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-bold uppercase text-red-400 tracking-wider">Exclusive Supply Chain</span>
              <h2 className="text-3xl font-black tracking-tight text-white leading-tight">
                Seamless Trade Connectivity Between China & India
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                We manage the entire transit pipeline—from supplier pickups in Ningbo, Yiwu, Guangzhou, and Shenzhen to final clearance at Indian customs ports (Nhava Sheva, Mundra, Kolkata, and ICD Delhi).
              </p>
              <div className="space-y-3 text-xs font-semibold text-slate-200">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Direct Factory Pickups & Packing Inspections</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Automated Carrier ETA Updates (+7 Days Filing Buffer)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Confidential Masked Container Tracking for Clients</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl">
                <img
                  src="/images/china-india-route.svg"
                  alt="China to India Freight Route Map"
                  className="w-full h-auto rounded-2xl object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 9. Customer Reviews Section (Matching usinternationallogistics.com) */}
        <section id="reviews" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold uppercase tracking-wider">
              <span>Client Testimonials</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Trusted By Importers Across India
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm">
              See what our logistics clients say about our China to India shipping and real-time tracking services.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Review 1 */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 relative flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 space-x-1">
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                </div>
                <p className="text-xs text-slate-700 italic leading-relaxed">
                  "I have been using US International Logistics for my business shipments, and they never disappoint. Their customs clearance support and efficient delivery between China and India make international shipping stress-free!"
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-center space-x-3">
                <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  RS
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Ratnesh Sharma</h4>
                  <p className="text-[11px] text-slate-500 font-semibold">Dispatcher / Importer</p>
                </div>
              </div>
            </div>

            {/* Review 2 */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 relative flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 space-x-1">
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                </div>
                <p className="text-xs text-slate-700 italic leading-relaxed">
                  "The delivery was incredibly fast and efficient! My shipment arrived earlier than expected, and the receipt tracking updates kept us informed every day. Highly recommended!"
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-center space-x-3">
                <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  AN
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Ankush Nagar</h4>
                  <p className="text-[11px] text-slate-500 font-semibold">Logistics Supervisor</p>
                </div>
              </div>
            </div>

            {/* Review 3 */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 relative flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 space-x-1">
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                  <Star className="w-4 h-4 fill-amber-400" />
                </div>
                <p className="text-xs text-slate-700 italic leading-relaxed">
                  "US International Logistics exceeded my expectations! Cargo from Guangzhou reached Delhi smoothly. Tracking updates were accurate and reliable throughout the journey."
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-center space-x-3">
                <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  RY
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Rahul Yadav</h4>
                  <p className="text-[11px] text-slate-500 font-semibold">Cargo Handler</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 10. FAQ Accordion Section */}
        <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm">
              Answers to common queries regarding tracking, filing buffers, and receipt lookups.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                  className="w-full p-5 text-left font-bold text-sm text-slate-900 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <span>{faq.q}</span>
                  {openFaqIndex === index ? (
                    <ChevronUp className="w-5 h-5 text-red-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>
                {openFaqIndex === index && (
                  <div className="p-5 pt-0 text-xs text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* 11. Footer (US International Logistics) */}
      <footer className="bg-slate-950 text-slate-400 py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-900 text-xs">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-white font-bold text-lg">
              <Ship className="w-5 h-5 text-red-600" />
              <span>US INTERNATIONAL LOGISTICS</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Specialized logistics partner for seamless freight forwarding, sourcing, and cargo tracking between China and India.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white uppercase tracking-wider text-xs">Contact Details</h4>
            <p className="flex items-center space-x-2">
              <Phone className="w-3.5 h-3.5 text-red-500" />
              <span>Phone: +91 9355456060</span>
            </p>
            <p className="flex items-center space-x-2">
              <Mail className="w-3.5 h-3.5 text-red-500" />
              <span>Mail: info@usinternationallogistics.com</span>
            </p>
            <p className="flex items-start space-x-2">
              <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <span>Address: Sector-7, Near Rohini West Metro Station, Rohini West, New Delhi 110085</span>
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white uppercase tracking-wider text-xs">Quick Navigation</h4>
            <ul className="space-y-1">
              <li><a href="#tracking" className="hover:text-red-400 transition">Cargo Tracking Portal</a></li>
              <li><a href="#services" className="hover:text-red-400 transition">Freight Services</a></li>
              <li><a href="#reviews" className="hover:text-red-400 transition">Customer Reviews</a></li>
              <li><Link href="/admin/login" className="hover:text-red-400 transition">Admin Login</Link></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-slate-900 pt-6 flex flex-col sm:flex-row items-center justify-between text-slate-500 gap-2">
          <p>© {new Date().getFullYear()} US International Logistics. All rights reserved.</p>
          <p>Confidential carrier container numbers strictly masked for public tracking.</p>
        </div>
      </footer>
    </div>
  );
}
