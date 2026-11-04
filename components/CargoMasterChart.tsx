'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import { ContainerMasterItem } from '@/store/cargoMasterSlice';
import {
  TrendingUp,
  PieChart,
  BarChart3,
  CheckCircle2,
  Truck,
  Clock,
  Download,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Anchor,
  Box,
  Activity,
  Calendar,
  Building2,
  RefreshCw,
  Sparkles,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

interface MetricStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  std: number;
}

interface AnalyticsApiResponse {
  success: boolean;
  overall: {
    containerCount: number;
    shipmentCount: number;
    receiptToLoading: MetricStats;
    whToDelivery: MetricStats;
    loadingToPort: MetricStats;
    portToDelivery: MetricStats;
    receiptToDelivery: MetricStats;
  };
  carrierStats: Record<
    string,
    {
      containerCount: number;
      shipmentCount: number;
      receiptToLoading: MetricStats;
      whToDelivery: MetricStats;
      loadingToPort: MetricStats;
      portToDelivery: MetricStats;
      receiptToDelivery: MetricStats;
    }
  >;
  allCarriers: string[];
  containerList: Array<{
    container: string;
    containerNumber: string;
    shippingLine: string;
    warehouse: string;
    loadingDate: string;
    portDate: string;
    deliveryDate: string;
    whToDeliveryDays: number | null;
    loadingToPortDays: number | null;
    portToDeliveryDays: number | null;
    totalCartons: number;
    totalWeight: number;
    totalVolume: number;
  }>;
  shipmentList: Array<{
    receipt: string;
    container: string;
    containerNumber: string;
    shippingLine: string;
    warehouse: string;
    party: string;
    commodity: string;
    receiptDate: string;
    loadingDate: string;
    portDate: string;
    deliveryDate: string;
    receiptToLoadingDays: number | null;
    receiptToDeliveryDays: number | null;
    whToDeliveryDays: number | null;
    loadingToPortDays: number | null;
    portToDeliveryDays: number | null;
  }>;
}

interface CargoMasterChartProps {
  containers: ContainerMasterItem[];
}

type StageType =
  | 'all'
  | 'receiptToLoading'
  | 'whToDelivery'
  | 'loadingToPort'
  | 'portToDelivery'
  | 'receiptToDelivery';
type ViewMode = 'stages' | 'fleetOverview';

export default function CargoMasterChart({ containers }: CargoMasterChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('stages');
  const [selectedStage, setSelectedStage] = useState<StageType>('all');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('ALL');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsApiResponse | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch strictly read-only analytics data from server API
  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch('/api/admin/delivery-analytics');
      const data = await res.json();
      if (res.ok && data.success) {
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to load server analytics, falling back to local computation:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Compute local fallback stats directly from props if API response is not yet available
  const localComputed = useMemo(() => {
    const parseDateSafe = (dStr?: string | null): Date | null => {
      if (!dStr || dStr === '—' || dStr === 'N/A' || dStr === 'Pending' || dStr === 'In Transit') return null;
      const m = dStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
      }
      const dt = new Date(dStr);
      return isNaN(dt.getTime()) ? null : dt;
    };

    const diffDaysSafe = (d1Str?: string | null, d2Str?: string | null): number | null => {
      const t1 = parseDateSafe(d1Str);
      const t2 = parseDateSafe(d2Str);
      if (!t1 || !t2) return null;
      const days = Math.round((t2.getTime() - t1.getTime()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 365 ? days : null;
    };

    const calcStatsSafe = (arr: number[]): MetricStats => {
      if (!arr || arr.length === 0) return { count: 0, avg: 0, min: 0, max: 0, std: 0 };
      const count = arr.length;
      const sum = arr.reduce((a, b) => a + b, 0);
      const avg = Math.round((sum / count) * 10) / 10;
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const variance = arr.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / count;
      const std = Math.round(Math.sqrt(variance) * 10) / 10;
      return { count, avg, min, max, std };
    };

    const whToDeliveryAll: number[] = [];
    const loadingToPortAll: number[] = [];
    const portToDeliveryAll: number[] = [];
    const carrierMap: Record<string, { whToDel: number[]; loadToPort: number[]; portToDel: number[]; count: number }> = {};

    containers.forEach((c) => {
      const isDel = Boolean(
        c.isDelivered ||
          (c.deliveryDate && c.deliveryDate.trim() && c.deliveryDate !== '—' && c.deliveryDate !== 'N/A' && c.deliveryDate !== 'In Transit') ||
          (c.status && c.status.toLowerCase().trim() === 'delivered')
      );
      if (!isDel) return;

      const carrier = (c.shippingLine || 'MSC').toUpperCase().trim();
      if (!carrierMap[carrier]) {
        carrierMap[carrier] = { whToDel: [], loadToPort: [], portToDel: [], count: 0 };
      }
      carrierMap[carrier].count++;

      const loading = c.loadingDate || c.startDate;
      const port = c.rawEta || c.destinationDate;
      const delivery = c.deliveryDate;

      const w2d = diffDaysSafe(loading, delivery);
      const l2p = diffDaysSafe(loading, port);
      const p2d = diffDaysSafe(port, delivery);

      if (w2d !== null) {
        whToDeliveryAll.push(w2d);
        carrierMap[carrier].whToDel.push(w2d);
      }
      if (l2p !== null) {
        loadingToPortAll.push(l2p);
        carrierMap[carrier].loadToPort.push(l2p);
      }
      if (p2d !== null) {
        portToDeliveryAll.push(p2d);
        carrierMap[carrier].portToDel.push(p2d);
      }
    });

    const carriers = Object.keys(carrierMap).sort();
    const carrierStats: Record<string, any> = {};
    for (const c of carriers) {
      carrierStats[c] = {
        containerCount: carrierMap[c].count,
        shipmentCount: carrierMap[c].count,
        receiptToLoading: { count: 0, avg: 0, min: 0, max: 0, std: 0 },
        whToDelivery: calcStatsSafe(carrierMap[c].whToDel),
        loadingToPort: calcStatsSafe(carrierMap[c].loadToPort),
        portToDelivery: calcStatsSafe(carrierMap[c].portToDel),
        receiptToDelivery: { count: 0, avg: 0, min: 0, max: 0, std: 0 },
      };
    }

    return {
      allCarriers: carriers,
      overall: {
        containerCount: containers.filter((c) => c.isDelivered).length,
        shipmentCount: containers.filter((c) => c.isDelivered).length,
        receiptToLoading: { count: 0, avg: 0, min: 0, max: 0, std: 0 },
        whToDelivery: calcStatsSafe(whToDeliveryAll),
        loadingToPort: calcStatsSafe(loadingToPortAll),
        portToDelivery: calcStatsSafe(portToDeliveryAll),
        receiptToDelivery: { count: 0, avg: 0, min: 0, max: 0, std: 0 },
      },
      carrierStats,
    };
  }, [containers]);

  // Combine server data or local fallback
  const effectiveCarriers = analyticsData?.allCarriers || localComputed.allCarriers;
  const effectiveOverall = analyticsData?.overall || localComputed.overall;
  const effectiveCarrierStats = analyticsData?.carrierStats || localComputed.carrierStats;

  // Active stats for currently selected stage and carrier
  const activeMetrics = useMemo(() => {
    const dataSource =
      selectedCarrier === 'ALL'
        ? effectiveOverall
        : effectiveCarrierStats[selectedCarrier] || effectiveOverall;

    if (!dataSource) {
      return { count: 0, avg: 0, min: 0, max: 0, std: 0 };
    }

    if (selectedStage === 'receiptToLoading') return dataSource.receiptToLoading;
    if (selectedStage === 'whToDelivery') return dataSource.whToDelivery;
    if (selectedStage === 'loadingToPort') return dataSource.loadingToPort;
    if (selectedStage === 'portToDelivery') return dataSource.portToDelivery;
    if (selectedStage === 'receiptToDelivery') return dataSource.receiptToDelivery;

    // 'all': Default to Warehouse to Delivery
    return dataSource.whToDelivery;
  }, [selectedStage, selectedCarrier, effectiveOverall, effectiveCarrierStats]);

  // Fleet Overview legacy stats
  const legacyFleetStats = useMemo(() => {
    let deliveredCount = 0;
    let inTransitCount = 0;
    let lateCount = 0;
    const carrierCountMap: Record<string, number> = {};
    const warehouseCountMap: Record<string, number> = {};

    containers.forEach((c) => {
      const isDelivered = Boolean(
        c.isDelivered ||
          (c.deliveryDate && c.deliveryDate.trim() && c.deliveryDate !== '—' && c.deliveryDate !== 'N/A' && c.deliveryDate !== 'In Transit') ||
          (c.status && c.status.toLowerCase().trim() === 'delivered')
      );
      const isLate = Boolean(!isDelivered && c.daysRemaining !== null && c.daysRemaining !== undefined && c.daysRemaining < 0);

      if (isDelivered) deliveredCount++;
      else if (isLate) lateCount++;
      else inTransitCount++;

      const carrier = (c.shippingLine || 'MSC').toUpperCase();
      carrierCountMap[carrier] = (carrierCountMap[carrier] || 0) + 1;

      const wh = (c.warehouse || 'China Warehouse').replace(' Warehouse', '');
      warehouseCountMap[wh] = (warehouseCountMap[wh] || 0) + 1;
    });

    return {
      total: containers.length,
      deliveredCount,
      inTransitCount,
      lateCount,
      carrierLabels: Object.keys(carrierCountMap).sort(),
      carrierCounts: Object.keys(carrierCountMap).sort().map((k) => carrierCountMap[k]),
      warehouseLabels: Object.keys(warehouseCountMap).sort(),
      warehouseCounts: Object.keys(warehouseCountMap).sort().map((k) => warehouseCountMap[k]),
    };
  }, [containers]);

  // Chart 1: Grouped Bar Chart - Compare Transit Stages across Shipping Lines
  const stageComparisonData = useMemo(() => {
    const labels = effectiveCarriers.length > 0 ? effectiveCarriers : ['CMA_CGM', 'COSCO', 'HMM', 'MSC'];
    const recToLoadDays = labels.map((c) => effectiveCarrierStats[c]?.receiptToLoading?.avg || 0);
    const whToDelDays = labels.map((c) => effectiveCarrierStats[c]?.whToDelivery?.avg || 0);
    const loadToPortDays = labels.map((c) => effectiveCarrierStats[c]?.loadingToPort?.avg || 0);
    const portToDelDays = labels.map((c) => effectiveCarrierStats[c]?.portToDelivery?.avg || 0);

    return {
      labels,
      datasets: [
        {
          label: 'Receipt ➔ Loading (Avg Days)',
          data: recToLoadDays,
          backgroundColor: '#F59E0B', // Amber
          borderRadius: 6,
          barPercentage: 0.85,
          categoryPercentage: 0.75,
        },
        {
          label: 'Warehouse ➔ Delivery (Avg Days)',
          data: whToDelDays,
          backgroundColor: '#6366F1', // Indigo
          borderRadius: 6,
          barPercentage: 0.85,
          categoryPercentage: 0.75,
        },
        {
          label: 'Loading ➔ Port (Avg Days)',
          data: loadToPortDays,
          backgroundColor: '#0EA5E9', // Sky Blue
          borderRadius: 6,
          barPercentage: 0.85,
          categoryPercentage: 0.75,
        },
        {
          label: 'Port ➔ Delivery (Avg Days)',
          data: portToDelDays,
          backgroundColor: '#10B981', // Emerald
          borderRadius: 6,
          barPercentage: 0.85,
          categoryPercentage: 0.75,
        },
      ],
    };
  }, [effectiveCarriers, effectiveCarrierStats]);

  const stageComparisonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 10, weight: 'bold' as const },
          boxWidth: 10,
          padding: 8,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${context.parsed.y} days`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Average Days', font: { size: 11, weight: 'bold' as const } },
        grid: { color: '#F1F5F9' },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11, weight: 'bold' as const } },
      },
    },
  };

  // Chart 2: Statistical Dispersion (Avg vs Min vs Max vs Std) across Shipping Lines
  const dispersionData = useMemo(() => {
    const labels = effectiveCarriers.length > 0 ? effectiveCarriers : ['CMA_CGM', 'COSCO', 'HMM', 'MSC'];

    const getStageMetric = (carrier: string) => {
      const stats = effectiveCarrierStats[carrier];
      if (!stats) return { avg: 0, min: 0, max: 0, std: 0 };
      if (selectedStage === 'receiptToLoading') return stats.receiptToLoading;
      if (selectedStage === 'loadingToPort') return stats.loadingToPort;
      if (selectedStage === 'portToDelivery') return stats.portToDelivery;
      if (selectedStage === 'receiptToDelivery') return stats.receiptToDelivery;
      return stats.whToDelivery; // default / whToDelivery
    };

    const avgData = labels.map((c) => getStageMetric(c).avg);
    const minData = labels.map((c) => getStageMetric(c).min);
    const maxData = labels.map((c) => getStageMetric(c).max);
    const stdData = labels.map((c) => getStageMetric(c).std);

    return {
      labels,
      datasets: [
        {
          label: 'Average Days',
          data: avgData,
          backgroundColor: '#4F46E5', // Indigo-600
          borderRadius: 6,
        },
        {
          label: 'Min Days (Fastest)',
          data: minData,
          backgroundColor: '#10B981', // Emerald-500
          borderRadius: 6,
        },
        {
          label: 'Max Days (Slowest)',
          data: maxData,
          backgroundColor: '#EF4444', // Red-500
          borderRadius: 6,
        },
        {
          label: 'Std Dev (σ Consistency)',
          data: stdData,
          backgroundColor: '#F59E0B', // Amber-500
          borderRadius: 6,
        },
      ],
    };
  }, [effectiveCarriers, effectiveCarrierStats, selectedStage]);

  const dispersionOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 10, weight: 'bold' as const },
          boxWidth: 10,
          padding: 8,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Days', font: { size: 11, weight: 'bold' as const } },
        grid: { color: '#F1F5F9' },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11, weight: 'bold' as const } },
      },
    },
  };

  // Fleet Donut Chart
  const doughnutData = {
    labels: ['Delivered', 'In Transit', 'Late / Delayed'],
    datasets: [
      {
        data: [legacyFleetStats.deliveredCount, legacyFleetStats.inTransitCount, legacyFleetStats.lateCount],
        backgroundColor: ['#10B981', '#3B82F6', '#EF4444'],
        borderColor: ['#059669', '#2563EB', '#DC2626'],
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  // Excel Export Handler (Generates Multi-Sheet XLSX with calculations & individual records)
  const handleExportExcel = (carrierFilter?: string) => {
    setIsExporting(true);
    try {
      const targetCarrier = carrierFilter || (selectedCarrier !== 'ALL' ? selectedCarrier : undefined);

      // Sheet 1: Summary Statistics Matrix
      const summaryRows: any[] = [];

      const stagesList: Array<{ key: StageType; label: string }> = [
        { key: 'receiptToLoading', label: 'Warehouse Receipt to Loading' },
        { key: 'whToDelivery', label: 'Warehouse to Delivery' },
        { key: 'loadingToPort', label: 'Loading to Port' },
        { key: 'portToDelivery', label: 'Port to Delivery (Port Clearance)' },
        { key: 'receiptToDelivery', label: 'Overall Receipt to Delivery' },
      ];

      // Add Overall Row
      stagesList.forEach((st) => {
        const stats = (effectiveOverall as any)[st.key] as MetricStats;
        summaryRows.push({
          Scope: 'TOTAL FLEET',
          'Shipping Line': 'ALL CARRIERS',
          'Transit Stage': st.label,
          'Records Count': stats?.count || 0,
          'Average (Mean) Days': stats?.avg || 0,
          'Minimum Days (Fastest)': stats?.min || 0,
          'Maximum Days (Slowest)': stats?.max || 0,
          'Standard Deviation (Std Dev σ)': stats?.std || 0,
        });
      });

      // Add Carrier Rows
      const carriersToExport = targetCarrier
        ? [targetCarrier]
        : effectiveCarriers;

      carriersToExport.forEach((car) => {
        const carData = effectiveCarrierStats[car];
        if (!carData) return;
        stagesList.forEach((st) => {
          const stats = (carData as any)[st.key] as MetricStats;
          summaryRows.push({
            Scope: 'CARRIER WISE',
            'Shipping Line': car,
            'Transit Stage': st.label,
            'Records Count': stats?.count || 0,
            'Average (Mean) Days': stats?.avg || 0,
            'Minimum Days (Fastest)': stats?.min || 0,
            'Maximum Days (Slowest)': stats?.max || 0,
            'Standard Deviation (Std Dev σ)': stats?.std || 0,
          });
        });
      });

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [
        { wch: 14 }, // Scope
        { wch: 16 }, // Shipping Line
        { wch: 34 }, // Stage
        { wch: 18 }, // Count
        { wch: 20 }, // Avg
        { wch: 22 }, // Min
        { wch: 22 }, // Max
        { wch: 28 }, // Std
      ];

      // Sheet 2: Container-level Calculations
      const containersSource = analyticsData?.containerList || containers.map((c) => ({
        container: c.container,
        containerNumber: c.containerNumber || '—',
        shippingLine: c.shippingLine || 'MSC',
        warehouse: c.warehouse || 'China Warehouse',
        loadingDate: c.loadingDate || c.startDate || '—',
        portDate: c.rawEta || c.destinationDate || '—',
        deliveryDate: c.deliveryDate || '—',
        whToDeliveryDays: c.daysToDeliver ?? null,
        loadingToPortDays: null,
        portToDeliveryDays: null,
        totalCartons: c.totalCartons || 0,
        totalWeight: c.totalWeight || 0,
        totalVolume: c.totalVolume || 0,
      }));

      const filteredContainers = targetCarrier
        ? containersSource.filter((c) => c.shippingLine.toUpperCase() === targetCarrier.toUpperCase())
        : containersSource;

      const containerRows = filteredContainers.map((c, idx) => ({
        'Sr. No': idx + 1,
        'Container Alias': c.container,
        'Carrier Container No': c.containerNumber,
        'Shipping Line': c.shippingLine,
        'Origin Warehouse': c.warehouse,
        'Loading / Departure Date': c.loadingDate,
        'Port Arrival Date (rawEta)': c.portDate,
        'Final Delivery Date': c.deliveryDate,
        'Wh to Delivery (Days)': c.whToDeliveryDays !== null ? c.whToDeliveryDays : 'N/A',
        'Loading to Port (Days)': c.loadingToPortDays !== null ? c.loadingToPortDays : 'N/A',
        'Port to Delivery (Days)': c.portToDeliveryDays !== null ? c.portToDeliveryDays : 'N/A',
        Cartons: c.totalCartons || 0,
        'Weight (KG)': c.totalWeight || 0,
        'Volume (CBM)': c.totalVolume || 0,
      }));

      const wsContainers = XLSX.utils.json_to_sheet(containerRows);

      // Sheet 3: Shipment Receipt-level Calculations
      const shipmentsSource = analyticsData?.shipmentList || [];
      const filteredShipments = targetCarrier
        ? shipmentsSource.filter((s) => s.shippingLine.toUpperCase() === targetCarrier.toUpperCase())
        : shipmentsSource;

      const shipmentRows = filteredShipments.map((s, idx) => ({
        'Sr. No': idx + 1,
        'Receipt No': s.receipt,
        'Container Alias': s.container,
        'Shipping Line': s.shippingLine,
        Party: s.party,
        Commodity: s.commodity,
        Warehouse: s.warehouse,
        'Receipt Received Date': s.receiptDate,
        'Warehouse Loading Date': s.loadingDate,
        'Port Date (rawEta)': s.portDate,
        'Delivery Date': s.deliveryDate,
        'Receipt to Loading (Days)': s.receiptToLoadingDays !== null ? s.receiptToLoadingDays : 'N/A',
        'Overall Receipt to Delivery (Days)': s.receiptToDeliveryDays !== null ? s.receiptToDeliveryDays : 'N/A',
        'Wh to Delivery (Days)': s.whToDeliveryDays !== null ? s.whToDeliveryDays : 'N/A',
        'Loading to Port (Days)': s.loadingToPortDays !== null ? s.loadingToPortDays : 'N/A',
        'Port to Delivery (Days)': s.portToDeliveryDays !== null ? s.portToDeliveryDays : 'N/A',
      }));

      const wsShipments = XLSX.utils.json_to_sheet(shipmentRows);

      // Assemble Workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary_Statistics');
      XLSX.utils.book_append_sheet(wb, wsContainers, 'Container_Calculations');
      if (shipmentRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, wsShipments, 'Shipment_Receipts');
      }

      const fileDate = new Date().toISOString().slice(0, 10);
      const carrierSuffix = targetCarrier ? `_${targetCarrier}` : '_All_Shipping_Lines';
      const fileName = `Transit_Delivery_Time_Calculation${carrierSuffix}_${fileDate}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Failed to export Excel calculation:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const getStageTitle = (st: StageType) => {
    switch (st) {
      case 'receiptToLoading':
        return 'Warehouse Receipt ➔ Loading Time';
      case 'whToDelivery':
        return 'Warehouse ➔ Delivery Time';
      case 'loadingToPort':
        return 'Loading ➔ Port Time';
      case 'portToDelivery':
        return 'Port ➔ Delivery Time (Port Clearance)';
      case 'receiptToDelivery':
        return 'Overall Receipt ➔ Delivery Time';
      default:
        return 'Warehouse ➔ Delivery Time';
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Header & View Mode Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              Transit & Delivery Time Intelligence
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Read-Only
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Receipt to Loading • Warehouse to Delivery • Loading to Port • Port to Delivery • Average, Min, Max & Std Dev
            </p>
          </div>
        </div>

        {/* View Mode Buttons + Excel Export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode('stages')}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'stages'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⏱️ Transit Stages & Stats
            </button>
            <button
              type="button"
              onClick={() => setViewMode('fleetOverview')}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'fleetOverview'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🚢 Fleet Overview
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleExportExcel()}
            disabled={isExporting}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95 disabled:opacity-50"
            title="Download full calculation sheet and underlying records in Excel format"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'stages' ? (
        <div className="space-y-4">
          {/* Controls Bar: Stage Selector & Shipping Line Filter */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Stage Selector Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Stage:</span>
              <button
                type="button"
                onClick={() => setSelectedStage('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  selectedStage === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All Stages View
              </button>
              <button
                type="button"
                onClick={() => setSelectedStage('receiptToLoading')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  selectedStage === 'receiptToLoading'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                Warehouse Receipt ➔ Loading
              </button>
              <button
                type="button"
                onClick={() => setSelectedStage('whToDelivery')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  selectedStage === 'whToDelivery'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Warehouse ➔ Delivery
              </button>
              <button
                type="button"
                onClick={() => setSelectedStage('loadingToPort')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  selectedStage === 'loadingToPort'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Loading ➔ Port
              </button>
              <button
                type="button"
                onClick={() => setSelectedStage('portToDelivery')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  selectedStage === 'portToDelivery'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Port ➔ Delivery (Port Clearance)
              </button>
              <button
                type="button"
                onClick={() => setSelectedStage('receiptToDelivery')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  selectedStage === 'receiptToDelivery'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Overall Receipt ➔ Delivery
              </button>
            </div>

            {/* Carrier Filter */}
            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" /> Carrier:
              </span>
              <select
                value={selectedCarrier}
                onChange={(e) => setSelectedCarrier(e.target.value)}
                className="px-2.5 py-1 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Shipping Companies (Fleet Overall)</option>
                {effectiveCarriers.map((carrier) => (
                  <option key={carrier} value={carrier}>
                    {carrier} ({effectiveCarrierStats[carrier]?.containerCount || 0} containers)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4 Core Statistical KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            {/* Card 1: Average Days */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Average (Mean)</span>
                <Clock className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-3xl font-black text-slate-900 font-mono tracking-tight">
                {activeMetrics.avg > 0 ? `${activeMetrics.avg}d` : '—'}
              </p>
              <p className="text-[10px] text-slate-500 font-medium truncate">
                Average transit days ({selectedCarrier === 'ALL' ? 'All Lines' : selectedCarrier})
              </p>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-indigo-50 rounded-full opacity-50 pointer-events-none" />
            </div>

            {/* Card 2: Minimum (Fastest) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Minimum (Fastest)</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-3xl font-black text-emerald-600 font-mono tracking-tight">
                {activeMetrics.min !== undefined && activeMetrics.min !== null ? `${activeMetrics.min}d` : '—'}
              </p>
              <p className="text-[10px] text-emerald-700 font-medium truncate">
                Fastest turnaround record
              </p>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-emerald-50 rounded-full opacity-50 pointer-events-none" />
            </div>

            {/* Card 3: Maximum (Slowest) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Maximum (Slowest)</span>
                <TrendingUp className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-3xl font-black text-rose-600 font-mono tracking-tight">
                {activeMetrics.max > 0 ? `${activeMetrics.max}d` : '—'}
              </p>
              <p className="text-[10px] text-rose-700 font-medium truncate">
                Longest turnaround record
              </p>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-rose-50 rounded-full opacity-50 pointer-events-none" />
            </div>

            {/* Card 4: Standard Deviation (Std Dev) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Std Dev (σ)</span>
                <Activity className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-3xl font-black text-amber-600 font-mono tracking-tight">
                {activeMetrics.std > 0 ? `±${activeMetrics.std}d` : '—'}
              </p>
              <p className="text-[10px] text-amber-700 font-medium truncate">
                Variability / consistency spread
              </p>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-amber-50 rounded-full opacity-50 pointer-events-none" />
            </div>

            {/* Card 5: Sample Size (Count) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1 relative overflow-hidden col-span-2 md:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Sample Size</span>
                <Box className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-3xl font-black text-blue-600 font-mono tracking-tight">
                {activeMetrics.count}
              </p>
              <p className="text-[10px] text-blue-700 font-medium truncate">
                Delivered shipments / records
              </p>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-blue-50 rounded-full opacity-50 pointer-events-none" />
            </div>
          </div>

          {/* Charts Grid (2 Visual Interactive Charts) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart 1: Grouped Bar Chart comparing Shipping Lines across Stages */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Shipping Line Comparison Across All Transit Stages
                  </h4>
                </div>
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                  Avg Days by Stage
                </span>
              </div>
              <div className="h-64 w-full relative">
                <Bar data={stageComparisonData} options={stageComparisonOptions} />
              </div>
            </div>

            {/* Chart 2: Statistical Dispersion (Avg, Min, Max, Std) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    {getStageTitle(selectedStage)}: Statistical Spread
                  </h4>
                </div>
                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                  Avg • Min • Max • Std
                </span>
              </div>
              <div className="h-64 w-full relative">
                <Bar data={dispersionData} options={dispersionOptions} />
              </div>
            </div>
          </div>

          {/* Comprehensive Statistical Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  Shipping Line Wise Performance Matrix (Click row or button for Excel format)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Full statistical breakdown: Average, Minimum, Maximum, and Standard Deviation for all carriers and stages.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleExportExcel()}
                className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export All to Excel</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3">Shipping Line</th>
                    <th className="py-2.5 px-3">Transit Stage</th>
                    <th className="py-2.5 px-3 text-right">Sample (N)</th>
                    <th className="py-2.5 px-3 text-right">Average (Mean)</th>
                    <th className="py-2.5 px-3 text-right">Min (Fastest)</th>
                    <th className="py-2.5 px-3 text-right">Max (Slowest)</th>
                    <th className="py-2.5 px-3 text-right">Std Dev (σ)</th>
                    <th className="py-2.5 px-3 text-center">Action / Excel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {/* Overall Fleet Benchmarks */}
                  <tr className="bg-indigo-50/50 hover:bg-indigo-50 transition cursor-pointer" onClick={() => handleExportExcel()}>
                    <td className="py-2.5 px-3 font-black text-indigo-950 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                      TOTAL FLEET (OVERALL)
                    </td>
                    <td className="py-2.5 px-3 text-indigo-900 font-bold">
                      {getStageTitle(selectedStage)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                      {activeMetrics.count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-indigo-700 text-sm">
                      {activeMetrics.avg}d
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-bold">
                      {activeMetrics.min !== undefined && activeMetrics.min !== null ? `${activeMetrics.min}d` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-700 font-bold">
                      {activeMetrics.max}d
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-bold">
                      ±{activeMetrics.std}d
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportExcel();
                        }}
                        className="px-2 py-0.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded text-[11px] font-bold"
                      >
                        📥 Excel
                      </button>
                    </td>
                  </tr>

                  {/* Carrier Rows */}
                  {effectiveCarriers.map((carrier) => {
                    const stats = effectiveCarrierStats[carrier];
                    if (!stats) return null;
                    const stageStats =
                      selectedStage === 'receiptToLoading'
                        ? stats.receiptToLoading
                        : selectedStage === 'loadingToPort'
                        ? stats.loadingToPort
                        : selectedStage === 'portToDelivery'
                        ? stats.portToDelivery
                        : selectedStage === 'receiptToDelivery'
                        ? stats.receiptToDelivery
                        : stats.whToDelivery;

                    return (
                      <tr
                        key={carrier}
                        className="hover:bg-slate-50 transition cursor-pointer"
                        onClick={() => handleExportExcel(carrier)}
                        title={`Click to download ${carrier} calculations in Excel format`}
                      >
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {carrier}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {getStageTitle(selectedStage)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {stageStats?.count || 0}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {stageStats?.avg > 0 ? `${stageStats.avg}d` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600">
                          {stageStats?.min !== undefined && stageStats?.min !== null ? `${stageStats.min}d` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                          {stageStats?.max > 0 ? `${stageStats.max}d` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-600">
                          {stageStats?.std > 0 ? `±${stageStats.std}d` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportExcel(carrier);
                            }}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded text-[11px] font-bold transition"
                          >
                            📥 Excel
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-xl text-[11px] text-slate-500 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                Clicking on any row or carrier button automatically generates and downloads its calculation list in formatted Excel (.xlsx).
              </span>
              <span className="font-bold text-slate-600">
                Formula: Std Dev σ = √( Σ(x - μ)² / N )
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Legacy Fleet & Status Overview View */
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Fleet Size</span>
                <Truck className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono">{legacyFleetStats.total}</p>
              <span className="text-[10px] text-slate-400 font-medium">Tracked Containers</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-600 uppercase">Delivered</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-emerald-600 font-mono">{legacyFleetStats.deliveredCount}</p>
              <span className="text-[10px] text-emerald-700 font-medium">
                {legacyFleetStats.total > 0
                  ? `${Math.round((legacyFleetStats.deliveredCount / legacyFleetStats.total) * 100)}% of fleet`
                  : '0%'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-600 uppercase">In Transit</span>
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-black text-blue-600 font-mono">{legacyFleetStats.inTransitCount}</p>
              <span className="text-[10px] text-blue-700 font-medium">En Route to Destination</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-600 uppercase">Late / Delayed</span>
                <Clock className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-2xl font-black text-rose-600 font-mono">{legacyFleetStats.lateCount}</p>
              <span className="text-[10px] text-rose-700 font-medium">Past Destination ETA</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                1. Delivery Status Distribution
              </h4>
              <div className="h-44 w-full relative">
                <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                2. Containers by Shipping Carrier
              </h4>
              <div className="h-44 w-full relative">
                <Bar
                  data={{
                    labels: legacyFleetStats.carrierLabels,
                    datasets: [
                      {
                        label: 'Containers',
                        data: legacyFleetStats.carrierCounts,
                        backgroundColor: '#0EA5E9',
                        borderRadius: 6,
                      },
                    ],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                3. Containers by Origin Warehouse
              </h4>
              <div className="h-44 w-full relative">
                <Bar
                  data={{
                    labels: legacyFleetStats.warehouseLabels,
                    datasets: [
                      {
                        label: 'Containers',
                        data: legacyFleetStats.warehouseCounts,
                        backgroundColor: '#8B5CF6',
                        borderRadius: 6,
                      },
                    ],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
