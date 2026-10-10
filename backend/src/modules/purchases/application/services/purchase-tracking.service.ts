import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';
import { computeTracking, TrackingLine, TrackingSnapshot } from './purchase-tracking';
import { withReceiptLifecycle } from './receipt-lifecycle';

export const TRACKING_ANCHORS = ['request', 'quotation', 'order', 'receipt', 'retaceo', 'consolidation'] as const;
export type TrackingAnchor = (typeof TRACKING_ANCHORS)[number];

type Ids = { requests: Set<number>; consolidations: Set<number>; quotations: Set<number>; orders: Set<number>; receipts: Set<number> };
const num = (value: { toString(): string } | number | null | undefined) => Number(value ?? 0);
const sizeOf = (ids: Ids) => ids.requests.size + ids.consolidations.size + ids.quotations.size + ids.orders.size + ids.receipts.size;
const arr = (set: Set<number>) => [...set];

/** Read-only view of one purchase process: every document connected to the anchor, plus stage and next step. */
@Injectable()
export class PurchaseTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async track(type: TrackingAnchor, id: number, companyId: number) {
    const ids = await this.resolve(type, id, companyId);
    const snapshot = await this.load(ids, companyId);
    return { anchor: { type, id }, ...computeTracking(snapshot.snapshot), documents: snapshot.documents, lines: snapshot.snapshot.lines };
  }

  private async resolve(type: TrackingAnchor, id: number, companyId: number): Promise<Ids> {
    const ids: Ids = { requests: new Set(), consolidations: new Set(), quotations: new Set(), orders: new Set(), receipts: new Set() };
    const p = this.prisma;
    const alive = { deletedAt: null };
    const missing = () => new NotFoundException('Documento no disponible en esta empresa');
    if (type === 'request') { if (!(await p.purchaseRequest.findFirst({ where: { id, companyId, ...alive }, select: { id: true } }))) throw missing(); ids.requests.add(id); }
    if (type === 'consolidation') { if (!(await p.purchaseConsolidation.findFirst({ where: { id, companyId, ...alive }, select: { id: true } }))) throw missing(); ids.consolidations.add(id); }
    if (type === 'quotation') { if (!(await p.purchaseQuotation.findFirst({ where: { id, companyId, ...alive }, select: { id: true } }))) throw missing(); ids.quotations.add(id); }
    if (type === 'order') { if (!(await p.purchaseOrder.findFirst({ where: { id, companyId, ...alive }, select: { id: true } }))) throw missing(); ids.orders.add(id); }
    if (type === 'receipt') { if (!(await p.purchase.findFirst({ where: { id, companyId, ...alive }, select: { id: true } }))) throw missing(); ids.receipts.add(id); }
    if (type === 'retaceo') {
      const retaceo = await p.retaceo.findFirst({ where: { id, companyId, ...alive }, select: { purchaseId: true } });
      if (!retaceo) throw missing();
      ids.receipts.add(retaceo.purchaseId);
    }

    // Follow the links until the connected set stops growing (bounded: a process has a handful of hops).
    for (let round = 0; round < 8; round++) {
      const before = sizeOf(ids);
      if (ids.requests.size) {
        const sources = await p.purchaseConsolidationSource.findMany({ where: { requestDetail: { requestId: { in: arr(ids.requests) } } }, select: { line: { select: { consolidationId: true } } } });
        sources.forEach(s => ids.consolidations.add(s.line.consolidationId));
        const links = await p.purchaseQuotationRequest.findMany({ where: { requestId: { in: arr(ids.requests) } }, select: { quotationId: true } });
        links.forEach(l => ids.quotations.add(l.quotationId));
      }
      if (ids.consolidations.size) {
        const sources = await p.purchaseConsolidationSource.findMany({ where: { line: { consolidationId: { in: arr(ids.consolidations) } } }, select: { requestDetail: { select: { requestId: true } } } });
        sources.forEach(s => ids.requests.add(s.requestDetail.requestId));
        const orders = await p.purchaseOrder.findMany({ where: { consolidationId: { in: arr(ids.consolidations) }, companyId, ...alive }, select: { id: true, quotationId: true } });
        orders.forEach(o => { ids.orders.add(o.id); ids.quotations.add(o.quotationId); });
        const rfqs = await p.purchaseRfq.findMany({ where: { consolidationId: { in: arr(ids.consolidations) }, ...alive }, select: { quotation: { select: { id: true } } } });
        rfqs.forEach(r => r.quotation && ids.quotations.add(r.quotation.id));
      }
      if (ids.quotations.size) {
        const links = await p.purchaseQuotationRequest.findMany({ where: { quotationId: { in: arr(ids.quotations) } }, select: { requestId: true } });
        links.forEach(l => ids.requests.add(l.requestId));
        const orders = await p.purchaseOrder.findMany({ where: { quotationId: { in: arr(ids.quotations) }, companyId, ...alive }, select: { id: true, consolidationId: true } });
        orders.forEach(o => { ids.orders.add(o.id); if (o.consolidationId) ids.consolidations.add(o.consolidationId); });
        const quotations = await p.purchaseQuotation.findMany({ where: { id: { in: arr(ids.quotations) } }, select: { rfq: { select: { consolidationId: true } } } });
        quotations.forEach(q => q.rfq && ids.consolidations.add(q.rfq.consolidationId));
      }
      if (ids.orders.size) {
        const orders = await p.purchaseOrder.findMany({ where: { id: { in: arr(ids.orders) } }, select: { quotationId: true, consolidationId: true } });
        orders.forEach(o => { ids.quotations.add(o.quotationId); if (o.consolidationId) ids.consolidations.add(o.consolidationId); });
        const receipts = await p.purchase.findMany({ where: { purchaseOrderId: { in: arr(ids.orders) }, companyId, ...alive }, select: { id: true } });
        receipts.forEach(r => ids.receipts.add(r.id));
      }
      if (ids.receipts.size) {
        const receipts = await p.purchase.findMany({ where: { id: { in: arr(ids.receipts) } }, select: { purchaseOrderId: true } });
        receipts.forEach(r => ids.orders.add(r.purchaseOrderId));
      }
      if (sizeOf(ids) === before) break;
    }
    return ids;
  }

  private async load(ids: Ids, companyId: number) {
    const p = this.prisma;
    const alive = { deletedAt: null };
    const [requests, consolidations, rfqs, quotations, orders, receipts, config] = await Promise.all([
      p.purchaseRequest.findMany({ where: { id: { in: arr(ids.requests) }, companyId, ...alive }, orderBy: { id: 'asc' },
        select: { id: true, code: true, status: true, details: { select: { id: true, productId: true, quantity: true, product: { select: { name: true } }, unit: { select: { name: true } },
          transferItems: { select: { quantity: true, receivedQuantity: true, transfer: { select: { id: true, documentNumber: true, status: true, deletedAt: true } } } } } } } }),
      p.purchaseConsolidation.findMany({ where: { id: { in: arr(ids.consolidations) }, companyId, ...alive }, orderBy: { id: 'asc' },
        select: { id: true, code: true, quantityReviewStatus: true, quantityRevision: true, quantityApprovedRevision: true, lines: { select: { productId: true, purchaseQuantity: true } } } }),
      p.purchaseRfq.findMany({ where: { consolidationId: { in: arr(ids.consolidations) }, ...alive }, select: { id: true, consolidationId: true, quotation: { select: { id: true, deletedAt: true } } } }),
      p.purchaseQuotation.findMany({ where: { id: { in: arr(ids.quotations) }, companyId, ...alive }, orderBy: { id: 'asc' }, select: { id: true, code: true, status: true } }),
      p.purchaseOrder.findMany({ where: { id: { in: arr(ids.orders) }, companyId, ...alive }, orderBy: { id: 'asc' },
        select: { id: true, code: true, status: true, consolidationId: true, details: { select: { productId: true, quantity: true, product: { select: { name: true } }, unit: { select: { name: true } } } } } }),
      p.purchase.findMany({ where: { id: { in: arr(ids.receipts) }, companyId, ...alive }, orderBy: { id: 'asc' },
        select: { id: true, documentNumber: true, status: true, purchaseOrderId: true, items: { select: { productId: true, quantity: true, locationId: true, product: { select: { name: true } }, unit: { select: { name: true } } } },
          retaceos: { select: { id: true, code: true, status: true, deletedAt: true } } } }),
      p.erpConfiguration.findFirst({ select: { generalWarehouseId: true } }),
    ]);

    // Per-product quantities: requested / decided / purchased / received / dispatched / delivered.
    const lines = new Map<number, TrackingLine>();
    const line = (productId: number, name: string, unit: string) => {
      let row = lines.get(productId);
      if (!row) { row = { productId, name, unit, requested: 0, decided: null, purchased: 0, received: 0, placed: 0, dispatched: 0, delivered: 0 }; lines.set(productId, row); }
      return row;
    };
    const transfers = new Map<number, { id: number; code: string; status: string }>();
    const requestTotals = requests.map(r => {
      let requested = 0, dispatched = 0, delivered = 0;
      for (const d of r.details) {
        const row = line(d.productId, d.product.name, d.unit.name);
        const items = d.transferItems.filter(t => !t.transfer.deletedAt && t.transfer.status !== 'CANCELLED');
        const sent = items.reduce((n, t) => n + num(t.quantity), 0);
        const got = items.reduce((n, t) => n + num(t.receivedQuantity), 0);
        row.requested += num(d.quantity); row.dispatched += sent; row.delivered += got;
        requested += num(d.quantity); dispatched += sent; delivered += got;
        items.forEach(t => transfers.set(t.transfer.id, { id: t.transfer.id, code: t.transfer.documentNumber, status: t.transfer.status }));
      }
      return { id: r.id, code: r.code, status: r.status, requested, dispatched, delivered };
    });
    for (const c of consolidations) for (const l of c.lines) {
      const row = lines.get(l.productId) ?? line(l.productId, '', '');
      row.decided = (row.decided ?? 0) + num(l.purchaseQuantity);
    }
    const activeOrders = orders.filter(o => !['cancelled', 'rejected'].includes(o.status));
    for (const o of activeOrders) for (const d of o.details) line(d.productId, d.product.name, d.unit.name).purchased += num(d.quantity);
    const activeReceipts = receipts.filter(r => r.status !== 'CANCELLED');
    for (const r of activeReceipts) for (const i of r.items) {
      const row = line(i.productId, i.product.name, i.unit.name);
      row.received += num(i.quantity);
      if (i.locationId !== null) row.placed += num(i.quantity);
    }
    const missingNames = [...lines.values()].filter(l => !l.name).map(l => l.productId);
    if (missingNames.length) {
      const products = await p.product.findMany({ where: { id: { in: missingNames } }, select: { id: true, name: true, purchaseUnit: { select: { name: true } } } });
      products.forEach(pr => { const row = lines.get(pr.id)!; row.name = pr.name; row.unit = pr.purchaseUnit.name; });
    }

    const snapshot: TrackingSnapshot = {
      generalWarehouseConfigured: !!config?.generalWarehouseId,
      requests: requestTotals,
      consolidations: consolidations.map(c => ({ id: c.id, code: c.code, reviewStatus: c.quantityReviewStatus, quantitiesApproved: c.quantityReviewStatus === 'approved' && c.quantityApprovedRevision === c.quantityRevision })),
      rfqs: rfqs.map(r => ({ id: r.id, consolidationId: r.consolidationId, hasOffer: !!r.quotation && !r.quotation.deletedAt })),
      quotations: quotations.map(q => ({ id: q.id, code: q.code, status: q.status })),
      orders: orders.map(o => ({ id: o.id, code: o.code, status: o.status, consolidationId: o.consolidationId })),
      receipts: receipts.map(r => {
        const life = withReceiptLifecycle(r);
        return { id: r.id, code: r.documentNumber, status: r.status, orderId: r.purchaseOrderId, pendingPlacement: r.items.some(i => i.locationId === null), retaceoStatus: life.retaceoStatus, retaceoArchived: life.retaceoArchived };
      }),
      transfers: [...transfers.values()],
      lines: [...lines.values()],
    };
    const documents = {
      requests: requestTotals.map(r => ({ id: r.id, code: r.code, status: r.status })),
      consolidations: consolidations.map(c => ({ id: c.id, code: c.code, status: c.quantityReviewStatus })),
      quotations: quotations.map(q => ({ id: q.id, code: q.code, status: q.status })),
      orders: orders.map(o => ({ id: o.id, code: o.code, status: o.status })),
      receipts: receipts.map(r => ({ id: r.id, code: r.documentNumber, status: r.status })),
      retaceos: receipts.flatMap(r => r.retaceos.filter(t => !t.deletedAt).map(t => ({ id: t.id, code: t.code, status: t.status }))),
      transfers: snapshot.transfers,
    };
    return { snapshot, documents };
  }
}
