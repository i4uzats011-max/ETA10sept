import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Shipment from "@/models/Shipment";
import { isStaffOrAdminAuthenticated } from "@/lib/auth";
import { shouldSyncContainer, getRequiredSyncIntervalDays } from "@/lib/jsoncargo";
import { calculateDaysToDeliver, parseReceiptDate } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const now = new Date();
    const allShipments = await Shipment.find({}).lean();

    // LATE CONTAINER DETECTION
    // A container is "late" if turnaround from receipt date to ETA > 35 days, or elapsed from receipt date > 35 days
    const lateContainers: any[] = [];
    allShipments.forEach((s: any) => {
      const receiptDate = parseReceiptDate(s.date) || (s.uploadedAt ? new Date(s.uploadedAt) : null);
      if (!receiptDate) return;

      const elapsedFromReceipt = Math.ceil((now.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysToDeliver = calculateDaysToDeliver(s.date, s.eta, s.uploadedAt);
      const isLate = (daysToDeliver !== null && daysToDeliver > 35) || elapsedFromReceipt > 35;

      if (isLate) {
        const effectiveDays = daysToDeliver !== null ? Math.max(daysToDeliver, elapsedFromReceipt) : elapsedFromReceipt;
        const etaDate = s.eta && s.eta !== 'N/A' ? new Date(s.eta) : null;
        lateContainers.push({
          _id: s._id,
          receipt: s.receipt,
          container: s.container,
          containerNumber: s.containerNumber,
          shippingLine: s.shippingLine,
          commodity: s.english || s.commodity,
          receiptDate: s.date || receiptDate.toISOString().slice(0, 10),
          eta: s.eta || 'Pending',
          status: s.status || 'In Transit',
          uploadedAt: s.uploadedAt,
          lastApiSync: s.lastApiSync,
          mainMarka: s.mainMarka,
          subMarka: s.subMarka,
          daysFromReceiptToEta: daysToDeliver,
          daysToDeliver: effectiveDays,
          daysOverLimit: effectiveDays > 35 ? effectiveDays - 35 : 0,
          daysRemainingFromToday: etaDate && !isNaN(etaDate.getTime()) ? Math.ceil((etaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
        });
      }
    });
    lateContainers.sort((a, b) => b.daysOverLimit - a.daysOverLimit);

    // NEEDS SYNC DETECTION
    const containerGroups: Record<string, any> = {};
    allShipments.forEach((s: any) => {
      if (!s.containerNumber || s.containerNumber === "N/A") return;
      if (!containerGroups[s.containerNumber]) {
        containerGroups[s.containerNumber] = {
          containerNumber: s.containerNumber,
          shippingLine: s.shippingLine,
          eta: s.eta,
          rawEta: s.rawEta,
          status: s.status,
          lastApiSync: s.lastApiSync,
          receipts: [],
        };
      }
      containerGroups[s.containerNumber].receipts.push(s.receipt);
    });

    const needsSyncContainers: any[] = [];
    Object.values(containerGroups).forEach((group: any) => {
      const lastSyncDate = group.lastApiSync ? new Date(group.lastApiSync) : null;
      if (!shouldSyncContainer(lastSyncDate, group.eta, now, group.status, group.rawEta)) return;

      // Calculate days to ETA based on actual carrier ETA (rawEta preferred over buffered ETA)
      const etaStringToUse = group.rawEta || group.eta;
      const etaDate = etaStringToUse && etaStringToUse !== "N/A" ? new Date(etaStringToUse) : null;
      const daysUntilEta = etaDate && !isNaN(etaDate.getTime()) ? Math.ceil((etaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
      const requiredIntervalDays = getRequiredSyncIntervalDays(daysUntilEta);

      needsSyncContainers.push({
        containerNumber: group.containerNumber,
        shippingLine: group.shippingLine,
        eta: group.eta,
        rawEta: group.rawEta,
        status: group.status,
        lastApiSync: group.lastApiSync,
        receipts: group.receipts,
        daysUntilEta,
        requiredIntervalDays,
        neverSynced: !group.lastApiSync,
      });
    });
    needsSyncContainers.sort((a, b) => {
      if (a.neverSynced && !b.neverSynced) return -1;
      if (!a.neverSynced && b.neverSynced) return 1;
      return (a.daysUntilEta ?? 9999) - (b.daysUntilEta ?? 9999);
    });

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      lateContainers,
      lateCount: lateContainers.length,
      needsSyncContainers,
      needsSyncCount: needsSyncContainers.length,
      syncSchedule: [
        { range: "1–7 days to ETA", intervalDays: 1, label: "Update Daily" },
        { range: "8–12 days to ETA", intervalDays: 2, label: "Every 2 Days" },
        { range: "13–20 days to ETA", intervalDays: 5, label: "Every 5 Days" },
        { range: "21–30 days to ETA", intervalDays: 7, label: "Every 7 Days" },
        { range: "30+ days to ETA", intervalDays: 10, label: "Every 10 Days" },
      ],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to compute late containers" }, { status: 500 });
  }
}
