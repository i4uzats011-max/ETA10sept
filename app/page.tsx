'use client';

import { useState, useEffect, useRef } from 'react';
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
  Warehouse,
  Boxes,
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
      doc.text('ETA:', 110, 69);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38); // Highlight ETA in Red
      doc.text(String(primary.dateOfDelivery || formatGlobalDate(primary.eta) || 'Pending'), 145, 69);
      doc.setTextColor(15, 23, 42);

      doc.setFont('helvetica', 'bold');
      doc.text('Loading Warehouse:', 18, 77);
      doc.setFont('helvetica', 'normal');
      doc.text(String(primary.warehouse || 'China Warehouse'), 50, 77);

      doc.setFont('helvetica', 'bold');
      doc.text('Delivery Schedule:', 110, 77);
      doc.setFont('helvetica', 'normal');
      doc.text('Confirmed Route', 145, 77);

      doc.setFont('helvetica', 'bold');
      doc.text('Cargo Marks:', 18, 85);
      doc.setFont('helvetica', 'normal');
      const marksStr = [primary.mainMarka ? `Main: ${primary.mainMarka}` : '', (primary.subMarka && primary.subMarka !== '??') ? `Sub: ${primary.subMarka}` : ''].filter(Boolean).join(' | ') || 'N/A';
      doc.text(marksStr, 50, 85);

      // Manifest Table
      const headers = ['#', 'Item / Commodity Name', 'Cargo Marks', 'Cartons (Qty)', 'Weight (KG)', 'Volume (CBM)', 'Container Alias', 'ETA'];
      const body = shipments.map((s, idx) => [
        idx + 1,
        s.english || s.commodity || 'General Cargo',
        [s.mainMarka ? `M:${s.mainMarka}` : '', (s.subMarka && s.subMarka !== '??') ? `S:${s.subMarka}` : ''].filter(Boolean).join(' ') || 'N/A',
        `${s.quantity || s.cartons || '0'} CTN`,
        s.weight ? `${s.weight} KG` : 'N/A',
        formatCBM(s.volume),
        s.container || 'Pending',
        s.dateOfDelivery || formatGlobalDate(s.eta) || 'Pending',
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

  // Typesense Autocomplete & Instant Suggestions
  const [typesenseSuggestions, setTypesenseSuggestions] = useState<Array<{
    type: 'receipt' | 'container';
    id: string;
    title: string;
    subtitle: string;
    value: string;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isTypesenseActive, setIsTypesenseActive] = useState(false);
  const suggestionsBoxRef = useRef<HTMLDivElement>(null);

  // FAQ Accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Debounced Typesense Autocomplete Suggestions (Containers only; Receipts are strictly confidential documents)
  useEffect(() => {
    // Strictly disable autocomplete for Receipt numbers to preserve confidentiality
    if (activeTab === 'receipt') {
      setTypesenseSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setTypesenseSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=container&limit=6`);
        if (res.ok) {
          const data = await res.json();
          const items = (data.results || []).map((c: any) => ({
            type: 'container' as const,
            id: c.id || c.container,
            title: `Container ${c.container}`,
            subtitle: `Status: ${c.status || 'In Transit'}`,
            value: c.container,
          }));
          setTypesenseSuggestions(items);
          setIsTypesenseActive(Boolean(data.typesenseActive));
          setShowSuggestions(items.length > 0);
        }
      } catch {
        // ignore
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  // Click outside to dismiss suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsBoxRef.current && !suggestionsBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performDirectSearch = async (queryInput: string, targetTab: 'receipt' | 'container') => {
    if (!queryInput) return;
    setIsLoading(true);
    setError(null);
    setReceiptResult(null);
    setContainerResult(null);
    setShowSuggestions(false);

    try {
      if (targetTab === 'receipt') {
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
                party
                warehouse
                warehouseEntry
                date
                quantity
                loadedQuantity
                remainingQuantity
                commodity
                chinese
                english
                packaging
                mainMarka
                subMarka
                weight
                volume
                status
              }
              shipments {
                id
                receipt
                party
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
                dateOfDelivery
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
              dateOfDelivery
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    performDirectSearch(searchQuery.trim(), activeTab);
  };

  const handleSelectSuggestion = (suggestion: { type: 'receipt' | 'container'; value: string }) => {
    setSearchQuery(suggestion.value);
    setActiveTab(suggestion.type);
    setShowSuggestions(false);
    performDirectSearch(suggestion.value, suggestion.type);
  };

  const receiptShipmentsList = receiptResult?.shipments || [];
  const whReceipt = receiptResult?.warehouseReceipt;

  // Aggregate loading allocation per container
  const containerMap = new Map<string, {
    container: string;
    quantity: number;
    dateOfDelivery: string;
    items: any[];
    weight: number;
    volume: number;
    isDelivered: boolean;
    deliveryDate?: string;
  }>();

  for (const s of receiptShipmentsList) {
    const c = (s.container || 'Unassigned').trim();
    if (!containerMap.has(c)) {
      containerMap.set(c, {
        container: c,
        quantity: 0,
        dateOfDelivery: s.dateOfDelivery || formatGlobalDate(s.eta) || 'Pending',
        items: [],
        weight: 0,
        volume: 0,
        isDelivered: Boolean(s.status === 'Delivered' || s.isDelivered),
        deliveryDate: s.deliveryDate,
      });
    }
    const entry = containerMap.get(c)!;
    const q = parseInt(String(s.quantity || s.cartons || 0), 10) || 0;
    const w = parseFloat(String(s.weight || 0)) || 0;
    const v = parseFloat(String(s.volume || 0).replace(/cbm|m3/gi, '')) || 0;
    entry.quantity += q;
    entry.weight += w;
    entry.volume += v;
    entry.items.push(s);
    if (s.dateOfDelivery && entry.dateOfDelivery === 'Pending') {
      entry.dateOfDelivery = s.dateOfDelivery;
    }
  }

  const containerBreakdown = Array.from(containerMap.values());
  const distinctContainers = containerBreakdown.map((c) => c.container);
  const totalLoadedCartons = containerBreakdown.reduce((sum, c) => sum + c.quantity, 0);
  const totalInwardCartons = whReceipt?.quantity !== undefined
    ? whReceipt.quantity
    : (receiptShipmentsList[0]?.originalTotalQuantity ? parseInt(String(receiptShipmentsList[0].originalTotalQuantity), 10) : totalLoadedCartons);
  const remainingWarehouseCartons = whReceipt?.remainingQuantity !== undefined
    ? whReceipt.remainingQuantity
    : Math.max(0, totalInwardCartons - totalLoadedCartons);
  const distinctContainersCount = containerBreakdown.length;

  const primaryGoods = whReceipt || receiptShipmentsList[0] || {};
  const partyName = whReceipt?.party || receiptShipmentsList[0]?.party || 'General Party';
  const commodityName = primaryGoods.english || primaryGoods.commodity || 'General Cargo';
  const chineseCommodity = primaryGoods.chinese && primaryGoods.chinese !== commodityName ? primaryGoods.chinese : '';
  const packagingType = primaryGoods.packaging || 'Carton';
  const warehouseLocation = whReceipt?.warehouse || receiptShipmentsList[0]?.warehouse || 'China Warehouse';
  const receiptDateFormatted = formatGlobalDate(primaryGoods.date) || primaryGoods.date || 'Recent';
  const marksSummary = [
    primaryGoods.mainMarka ? `Main: ${primaryGoods.mainMarka}` : '',
    primaryGoods.subMarka && primaryGoods.subMarka !== '??' ? `Sub: ${primaryGoods.subMarka}` : ''
  ].filter(Boolean).join(' | ') || 'N/A';


  const faqs = [
    {
      q: 'How does the container arrival date calculation work?',
      a: 'For live carrier APIs, an automated +10 days buffer is added to the actual carrier vessel ETA to account for customs clearance and container terminal processing in India. If the ETA date is explicitly defined by our admin team, the exact date set by the admin is displayed directly.',
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
                    <span>Search by Container No.</span>
                  </button>
                </div>

                {/* Search Form */}
                <form onSubmit={handleSearch} className="p-6 sm:p-8 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      {activeTab === 'receipt'
                        ? 'Enter Receipt Number (e.g., REC-1002)'
                        : 'Enter Container Number (e.g., USI-01 or MSCU1234567)'}
                    </label>
                    <div className="relative" ref={suggestionsBoxRef}>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onFocus={() => {
                            if (activeTab === 'container' && typesenseSuggestions.length > 0) {
                              setShowSuggestions(true);
                            }
                          }}
                          placeholder={
                            activeTab === 'receipt'
                              ? 'Enter exact Receipt Number (e.g., REC-1002)...'
                              : 'Enter Container Number (e.g., USI-01 or MSCU1234567)...'
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

                      {/* Confidential Document Notice for Receipts */}
                      {activeTab === 'receipt' && (
                        <div className="flex items-center space-x-2 text-xs text-slate-500 mt-2.5 font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span>
                            <strong className="text-slate-700">Confidential Document:</strong> To protect customer privacy, Receipt Numbers do not autocomplete. Enter your exact receipt number to track.
                          </span>
                        </div>
                      )}

                      {/* Container Typesense Suggestions Dropdown (Only on Container Tab) */}
                      {activeTab === 'container' && showSuggestions && typesenseSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-30 animate-fadeIn">
                          <div className="p-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            <span>Instant Suggestions</span>
                            <span className="inline-flex items-center space-x-1 text-red-600 font-bold">
                              <span>⚡ Typesense Search</span>
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                            {typesenseSuggestions.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => handleSelectSuggestion(s)}
                                className="w-full px-4 py-3 text-left hover:bg-red-50/60 transition flex items-center justify-between group"
                              >
                                <div>
                                  <div className="font-mono font-bold text-sm text-slate-900 group-hover:text-red-700">
                                    {s.title}
                                  </div>
                                  <div className="text-xs text-slate-500">{s.subtitle}</div>
                                </div>
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-red-100 group-hover:text-red-800">
                                  {s.type}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
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
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 animate-fadeIn">
              {/* Top Banner with Receipt Info & PDF Download */}
              <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-red-950 shadow-sm">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-red-600" />
                  <span>
                    Receipt Number: <strong className="font-mono text-sm text-slate-950">{receiptResult.receipt}</strong>
                  </span>
                  <span
                    className={`ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      remainingWarehouseCartons === 0
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {remainingWarehouseCartons === 0
                      ? `Fully Loaded (${distinctContainersCount} Containers)`
                      : `Partially Loaded (${distinctContainersCount} Containers • ${remainingWarehouseCartons} CTN In WH)`}
                  </span>
                </div>

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

              {/* 4 Summary Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
                    <span>Total Inward</span>
                    <Package className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 font-mono">
                    {totalInwardCartons} <span className="text-xs font-semibold text-slate-400 font-sans">CTN</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Received at China WH</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
                    <span>Loaded Quantity</span>
                    <Truck className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-black text-emerald-600 font-mono">
                    {totalLoadedCartons} <span className="text-xs font-semibold text-slate-400 font-sans">CTN</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {totalInwardCartons > 0 ? `${Math.round((totalLoadedCartons / totalInwardCartons) * 100)}% of shipment` : 'Allocated to containers'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
                    <span>Warehouse Balance</span>
                    <Box className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-black text-amber-600 font-mono">
                    {remainingWarehouseCartons} <span className="text-xs font-semibold text-slate-400 font-sans">CTN</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {remainingWarehouseCartons > 0 ? 'Remaining in China WH' : 'All Goods Dispatched'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
                    <span>Containers</span>
                    <Layers className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="text-2xl font-black text-purple-900 font-mono">
                    {distinctContainersCount} <span className="text-xs font-semibold text-slate-400 font-sans">{distinctContainersCount === 1 ? 'Container' : 'Containers'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Carrying your goods</div>
                </div>
              </div>

              {/* CARD 1: FULL DETAILS OF RECEIVED GOODS */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <Package className="w-5 h-5 text-red-500" />
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider">Full Details of Received Goods</h4>
                      <p className="text-[11px] text-slate-400">Verified Inward Cargo Profile from China Warehouse</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-slate-700">
                    Party: {partyName}
                  </span>
                </div>

                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Commodity / Item Name</span>
                    <div className="font-bold text-slate-900 text-sm leading-tight">
                      {commodityName}
                    </div>
                    {chineseCommodity && (
                      <div className="text-[11px] text-slate-400 mt-0.5">{chineseCommodity}</div>
                    )}
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Packaging & Units</span>
                    <div className="font-black text-slate-900 text-sm">
                      {totalInwardCartons} CTN / {packagingType}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Package Type: {packagingType}</div>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">China Receiving Warehouse</span>
                    <div className="font-bold text-slate-900 text-sm flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>{warehouseLocation}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Received Date: {receiptDateFormatted}</div>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Cargo Marks & Measurements</span>
                    <div className="font-mono text-xs font-bold text-slate-900 truncate" title={marksSummary}>
                      {marksSummary}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {primaryGoods.weight ? `${primaryGoods.weight} KG` : 'N/A'} • {formatCBM(primaryGoods.volume)}
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: HOW MUCH LOAD IN WHICH CONTAINER (CONTAINER BREAKDOWN) */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-md">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-black uppercase tracking-wider text-white">
                        Container Allocation & Delivery Schedule
                      </h4>
                      <p className="text-xs text-slate-400">
                        Showing how much goods are loaded in each container across {distinctContainersCount} container{distinctContainersCount === 1 ? '' : 's'}:
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-800 text-red-400 border border-slate-700">
                      Total Loaded: {totalLoadedCartons} CTN
                    </span>
                    {remainingWarehouseCartons > 0 && (
                      <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {remainingWarehouseCartons} CTN Remaining in WH
                      </span>
                    )}
                  </div>
                </div>

                {/* Per-Container Breakdown Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {containerBreakdown.map((item, cIdx) => {
                    const percent = totalInwardCartons > 0 ? Math.round((item.quantity / totalInwardCartons) * 100) : 100;
                    return (
                      <div
                        key={item.container}
                        className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-5 border border-slate-700 shadow-lg flex flex-col justify-between space-y-4 hover:border-red-500 transition group"
                      >
                        {/* Container Alias & Container Number Badge */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="w-7 h-7 rounded-xl bg-red-600/30 border border-red-500/40 text-red-400 font-mono font-black text-xs flex items-center justify-center">
                              #{cIdx + 1}
                            </span>
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Internal Container</span>
                              <span className="font-mono font-black text-base text-white tracking-wide">{item.container}</span>
                            </div>
                          </div>

                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-800 text-amber-300 border border-slate-700">
                            Loaded in Container
                          </span>
                        </div>

                        {/* Quantity Loaded in this Container */}
                        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold">Quantity Loaded:</span>
                            <span className="font-mono font-black text-sm text-amber-300">
                              {item.quantity} CTN <span className="text-[11px] text-slate-400 font-normal">({percent}%)</span>
                            </span>
                          </div>

                          {/* Progress bar visual */}
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-red-600 to-amber-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            ></div>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                            <span>Share of Total Cargo</span>
                            <span className="font-bold text-slate-300">{item.quantity} of {totalInwardCartons} Cartons</span>
                          </div>
                        </div>

                        {/* ETA Date (Calculated with 10 days added) */}
                        <div className="p-3 bg-red-950/40 rounded-xl border border-red-900/50 flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                            <div>
                              <span className="text-[10px] uppercase font-bold text-red-300 block">
                                ETA
                              </span>
                              <span className="text-sm font-black font-mono text-white">
                                {item.dateOfDelivery}
                              </span>
                            </div>
                          </div>
                          {item.items.length > 1 && (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              {item.items.length} items
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Warehouse Stock Remaining Card (If Split and not fully loaded) */}
                  {remainingWarehouseCartons > 0 && (
                    <div className="bg-amber-950/30 rounded-2xl p-5 border-2 border-dashed border-amber-600/50 shadow-lg flex flex-col justify-between space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                            <Warehouse className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Remaining Balance</span>
                            <span className="font-bold text-sm text-white">{warehouseLocation}</span>
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Awaiting Next Plan
                        </span>
                      </div>

                      <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-semibold">Remaining Stock:</span>
                          <span className="font-mono font-black text-sm text-amber-400">
                            {remainingWarehouseCartons} CTN <span className="text-[11px] text-slate-400 font-normal">({totalInwardCartons > 0 ? Math.round((remainingWarehouseCartons / totalInwardCartons) * 100) : 0}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-amber-500 h-2 rounded-full"
                            style={{ width: `${totalInwardCartons > 0 ? Math.min(Math.round((remainingWarehouseCartons / totalInwardCartons) * 100), 100) : 0}%` }}
                          ></div>
                        </div>
                      </div>

                      <p className="text-[11px] text-amber-200/80 italic leading-relaxed">
                        ℹ️ This receipt was split. {remainingWarehouseCartons} cartons are safely in warehouse inventory and will be loaded into the next available container.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 3: INDIVIDUAL CARGO ITEMS & MANIFEST DETAILS */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                    <Boxes className="w-4 h-4 text-red-600" />
                    <span>Manifest Items Detailed View ({receiptShipmentsList.length} Records)</span>
                  </h4>
                  <span className="text-xs text-slate-500">
                    All containers and cargo item packages
                  </span>
                </div>

                {receiptShipmentsList.map((item: any, idx: number) => {
                  return (
                    <div
                      key={item.id || idx}
                      className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden space-y-5 animate-fadeIn"
                    >
                      {/* Header Banner */}
                      <div className="bg-slate-900 p-5 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
                        <div>
                          <span className="text-xs uppercase font-bold text-red-400 tracking-wider">
                            Cargo Item #{idx + 1} • Receipt {item.receipt}
                          </span>
                          <h3 className="text-xl font-black font-mono tracking-tight mt-0.5 text-white">{item.receipt}</h3>
                          <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-2">
                            <span className="flex items-center space-x-1.5">
                              <Box className="w-4 h-4 text-amber-400" />
                              <span>Loaded in Container:</span>
                            </span>
                            <strong className="text-amber-300 font-mono bg-slate-800 px-2.5 py-0.5 rounded text-xs border border-amber-500/40">
                              {item.container}
                            </strong>
                            {distinctContainersCount > 1 && (
                              <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                                Container {distinctContainers.indexOf(item.container) + 1} of {distinctContainersCount}
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2 text-white px-4 py-2 rounded-xl border shadow-sm bg-gradient-to-r from-red-600 to-rose-600 border-red-400/40">
                            <Clock className="w-4 h-4 text-amber-300" />
                            <div>
                              <span className="text-[9px] uppercase font-bold text-rose-200 block">
                                ETA
                              </span>
                              <span className="text-sm font-black font-mono text-white">
                                {item.dateOfDelivery || formatGlobalDate(item.eta) || 'Pending'}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => downloadReceiptPDF(item.receipt, [item])}
                            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition border border-slate-700"
                            title="Download PDF slip for this item"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Cargo Item Key Metrics */}
                      <div className="px-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">Loaded Quantity</span>
                          <p className="font-mono font-black text-lg text-slate-900 mt-0.5">
                            {item.quantity || item.cartons || '0'}{' '}
                            <span className="text-xs font-medium text-slate-500">CTN</span>
                          </p>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">Gross Weight</span>
                          <p className="font-mono font-black text-lg text-slate-900 mt-0.5">
                            {item.weight && item.weight !== 'N/A' ? `${item.weight} KG` : 'N/A'}
                          </p>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">Volume (CBM)</span>
                          <p className="font-mono font-black text-lg text-slate-900 mt-0.5">
                            {formatCBM(item.volume)}
                          </p>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">Packaging</span>
                          <p className="font-bold text-xs text-slate-800 mt-1 uppercase truncate">
                            {item.packaging || 'Cartons / CTN'}
                          </p>
                        </div>
                      </div>

                      {/* Line Item Detailed Specs */}
                      <div className="px-6 pb-6">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <span className="text-slate-400 font-semibold block">Commodity Description:</span>
                              <strong className="text-slate-800 text-sm">{item.english || item.commodity || 'General Cargo'}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 font-semibold block">Shipping Marks:</span>
                              <span className="font-mono text-slate-800 font-bold">
                                {[item.mainMarka ? `M:${item.mainMarka}` : '', item.subMarka && item.subMarka !== '??' ? `S:${item.subMarka}` : '']
                                  .filter(Boolean)
                                  .join(' | ') || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-semibold block">Origin Warehouse:</span>
                              <span className="text-slate-800 font-medium">{item.warehouse || 'China Warehouse'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}


          {/* 6. Container Search Results (CONTAINER ALIAS AND DATE OF DELIVERY (ETA + 10 DAYS) ONLY) */}
          {activeTab === 'container' && containerResult && (
            <section className="max-w-md mx-auto px-4 sm:px-6 space-y-4">
              <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden p-8 space-y-6 text-center animate-fadeIn">
                <div className="space-y-1">
                  <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Container No.</span>
                  <div className="text-3xl font-black font-mono text-slate-950">
                    {containerResult.container}
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-slate-900 text-white space-y-2 border border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    ETA
                  </span>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-amber-300">
                    {containerResult.dateOfDelivery || formatGlobalDate(containerResult.eta) || 'Pending'}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Estimated arrival date for container {containerResult.container}.
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
                  <span>Automated Carrier ETA Updates (Actual Vessel ETA + 10 Days Buffer)</span>
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
