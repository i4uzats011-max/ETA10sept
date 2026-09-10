'use client';

import React, { useMemo } from 'react';
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
import { ContainerMasterItem } from '@/store/cargoMasterSlice';
import { TrendingUp, PieChart, BarChart3, CheckCircle2, Truck, Clock, AlertTriangle } from 'lucide-react';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

interface CargoMasterChartProps {
  containers: ContainerMasterItem[];
}

export default function CargoMasterChart({ containers }: CargoMasterChartProps) {
  // Compute Analytics Data
  const stats = useMemo(() => {
    let deliveredCount = 0;
    let inTransitCount = 0;
    let lateCount = 0;
    let totalDaysToDeliver = 0;
    let deliveredWithDaysCount = 0;

    // Carrier performance grouping: carrier -> array of daysToDeliver
    const carrierDaysMap: Record<string, number[]> = {};

    containers.forEach((c) => {
      const isDelivered = Boolean(
        c.isDelivered || (c.status && c.status.toLowerCase().includes('deliver'))
      );

      const isLate = Boolean(
        !isDelivered && c.daysRemaining !== null && c.daysRemaining !== undefined && c.daysRemaining < 0
      );

      if (isDelivered) {
        deliveredCount++;
        if (c.daysToDeliver !== null && c.daysToDeliver !== undefined) {
          totalDaysToDeliver += c.daysToDeliver;
          deliveredWithDaysCount++;

          const carrier = (c.shippingLine || 'MSC').toUpperCase();
          if (!carrierDaysMap[carrier]) carrierDaysMap[carrier] = [];
          carrierDaysMap[carrier].push(c.daysToDeliver);
        }
      } else if (isLate) {
        lateCount++;
      } else {
        inTransitCount++;
      }
    });

    const avgTurnaround =
      deliveredWithDaysCount > 0
        ? Math.round((totalDaysToDeliver / deliveredWithDaysCount) * 10) / 10
        : 0;

    // Build carrier bar data
    const carrierLabels = Object.keys(carrierDaysMap);
    const carrierAvgDays = carrierLabels.map((line) => {
      const arr = carrierDaysMap[line];
      const sum = arr.reduce((acc, v) => acc + v, 0);
      return Math.round((sum / arr.length) * 10) / 10;
    });

    // Carrier distribution map: carrier -> count
    const carrierCountMap: Record<string, number> = {};
    // Warehouse distribution map: warehouse -> count
    const warehouseCountMap: Record<string, number> = {};

    containers.forEach((c) => {
      const carrier = (c.shippingLine || 'MSC').toUpperCase();
      carrierCountMap[carrier] = (carrierCountMap[carrier] || 0) + 1;

      const wh = (c.warehouse || 'China Warehouse').replace(' Warehouse', '');
      warehouseCountMap[wh] = (warehouseCountMap[wh] || 0) + 1;
    });

    const fleetCarrierLabels = Object.keys(carrierCountMap).sort();
    const fleetCarrierCounts = fleetCarrierLabels.map((l) => carrierCountMap[l]);

    const warehouseLabels = Object.keys(warehouseCountMap).sort();
    const warehouseCounts = warehouseLabels.map((w) => warehouseCountMap[w]);

    return {
      total: containers.length,
      deliveredCount,
      inTransitCount,
      lateCount,
      avgTurnaround,
      carrierLabels,
      carrierAvgDays,
      fleetCarrierLabels,
      fleetCarrierCounts,
      warehouseLabels,
      warehouseCounts,
    };
  }, [containers]);

  // Donut Chart: Status Distribution
  const doughnutData = {
    labels: ['Delivered', 'In Transit', 'Late / Delayed'],
    datasets: [
      {
        data: [stats.deliveredCount, stats.inTransitCount, stats.lateCount],
        backgroundColor: ['#10B981', '#3B82F6', '#EF4444'],
        borderColor: ['#059669', '#2563EB', '#DC2626'],
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { size: 11, weight: 'bold' as const },
          boxWidth: 12,
          padding: 12,
        },
      },
    },
    cutout: '70%',
  };

  // Bar Chart: Carrier Average Days to Deliver
  const barData = {
    labels: stats.carrierLabels.length > 0 ? stats.carrierLabels : ['MSC', 'MAERSK', 'COSCO'],
    datasets: [
      {
        label: 'Avg Days to Deliver (Turnaround)',
        data: stats.carrierAvgDays.length > 0 ? stats.carrierAvgDays : [28, 31, 33],
        backgroundColor: '#4F46E5',
        borderRadius: 8,
        barThickness: 24,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.y} Days from Loading to Delivery`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#F1F5F9' },
        ticks: { font: { size: 10, weight: 'bold' as const } },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: 'bold' as const } },
      },
    },
  };

  // Bar Chart 2: Fleet Share by Carrier
  const carrierFleetData = {
    labels: stats.fleetCarrierLabels.length > 0 ? stats.fleetCarrierLabels : ['MSC', 'MAERSK'],
    datasets: [
      {
        label: 'Containers',
        data: stats.fleetCarrierCounts.length > 0 ? stats.fleetCarrierCounts : [1, 1],
        backgroundColor: '#0EA5E9',
        borderRadius: 8,
        barThickness: 24,
      },
    ],
  };

  const carrierFleetOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 10, weight: 'bold' as const } },
        grid: { color: '#F1F5F9' },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: 'bold' as const } },
      },
    },
  };

  // Bar Chart 3: Containers by Origin Warehouse
  const warehouseData = {
    labels: stats.warehouseLabels.length > 0 ? stats.warehouseLabels : ['Guangzhou', 'Yiwu', 'Ningbo'],
    datasets: [
      {
        label: 'Containers Planned',
        data: stats.warehouseCounts.length > 0 ? stats.warehouseCounts : [1, 1, 1],
        backgroundColor: '#8B5CF6',
        borderRadius: 8,
        barThickness: 24,
      },
    ],
  };

  const warehouseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 10, weight: 'bold' as const } },
        grid: { color: '#F1F5F9' },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: 'bold' as const } },
      },
    },
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Fleet Size</span>
            <Truck className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">{stats.total}</p>
          <span className="text-[10px] text-slate-400 font-medium">Tracked Containers</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 uppercase">Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 font-mono">{stats.deliveredCount}</p>
          <span className="text-[10px] text-emerald-700 font-medium">
            {stats.total > 0 ? `${Math.round((stats.deliveredCount / stats.total) * 100)}% of fleet` : '0%'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-600 uppercase">In Transit</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-600 font-mono">{stats.inTransitCount}</p>
          <span className="text-[10px] text-blue-700 font-medium">En Route to Destination</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-600 uppercase">Avg Turnaround</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-indigo-700 font-mono">
            {stats.avgTurnaround > 0 ? `${stats.avgTurnaround}d` : '—'}
          </p>
          <span className="text-[10px] text-indigo-700 font-medium">Loading to Delivery</span>
        </div>
      </div>

      {/* 4 Static Charts Grid (2x2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chart 1: Fleet Status Donut Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                1. Delivery Status Distribution
              </h4>
            </div>
            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
              Static Donut
            </span>
          </div>
          <div className="h-44 w-full relative">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>

        {/* Chart 2: Turnaround Performance Bar Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                2. Carrier Avg Turnaround Days
              </h4>
            </div>
            <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
              Days to Deliver
            </span>
          </div>
          <div className="h-44 w-full relative">
            <Bar data={barData} options={barOptions} />
          </div>
        </div>

        {/* Chart 3: Fleet Distribution by Shipping Line */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-sky-600" />
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                3. Containers by Shipping Carrier
              </h4>
            </div>
            <span className="text-[10px] font-bold bg-sky-50 text-sky-700 px-2 py-0.5 rounded">
              Carrier Fleet
            </span>
          </div>
          <div className="h-44 w-full relative">
            <Bar data={carrierFleetData} options={carrierFleetOptions} />
          </div>
        </div>

        {/* Chart 4: Containers by China Origin Warehouse */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                4. Containers by Origin Warehouse
              </h4>
            </div>
            <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
              China Origins
            </span>
          </div>
          <div className="h-44 w-full relative">
            <Bar data={warehouseData} options={warehouseOptions} />
          </div>
        </div>
      </div>
    </div>
  );
}
