import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Shipment from "@/models/Shipment";
import Container from "@/models/Container";
import { isStaffOrAdminAuthenticated } from "@/lib/auth";
import { calculateDaysToDeliver, parseReceiptDate } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const now = new Date();

    // Fetch delivered container aliases/numbers to strictly exclude delivered cargo
    const deliveredContainerDocs = await Container.find({ isDelivered: true })
      .select('container containerNumber')
      .lean();
    const deliveredSet = new Set<string>();
    deliveredContainerDocs.forEach((c: any) => {
      if (c.container) deliveredSet.add(c.container.trim().toLowerCase());
      if (c.containerNumber) deliveredSet.add(c.containerNumber.trim().toLowerCase());
    });

    // Query strictly active, UNDELIVERED shipments (Zero data modification, read-only query)
    const allShipments = await Shipment.find({
      isDelivered: { $ne: true },
      status: { $nin: ['Delivered', 'delivered'] },
    }).lean();

    // LATE CONTAINER DETECTION (UNDELIVERED ONLY)
    // An active container/shipment is "late" if turnaround from receipt date to ETA > 35 days, or elapsed from receipt date > 35 days
    const lateContainers: any[] = [];
    allShipments.forEach((s: any) => {
      // Exclude any delivered cargo or cargo belonging to delivered containers
      if (s.isDelivered === true || String(s.status || '').toLowerCase() === 'delivered') return;
      if (s.container && deliveredSet.has(s.container.trim().toLowerCase())) return;
      if (s.containerNumber && deliveredSet.has(s.containerNumber.trim().toLowerCase())) return;

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

    // API tracking is permanently stopped — needsSyncContainers is strictly empty
    const needsSyncContainers: any[] = [];

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      lateContainers,
      lateCount: lateContainers.length,
      needsSyncContainers: [],
      needsSyncCount: 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to compute late containers" }, { status: 500 });
  }
}
