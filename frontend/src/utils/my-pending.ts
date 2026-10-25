// "Mis pendientes": the purchase processes whose next step belongs to the team of the signed-in user.
// The backend already decides each process' next step and its owner; this module only picks what is mine.
import { canOpenRoute, type Owner, type ProcessRow, type TrackingStep } from './purchase-tracking';

/** The teams a user acts for, inferred from the permission that lets them do that team's work. */
const OWNER_PERMISSION: [Owner, string][] = [
  ['Sucursal', 'purchase_requests.create'],
  ['Compras', 'purchase_quotations.create'],
  ['Gerencia', 'purchase_orders.approve'],
  ['Bodega', 'purchase_orders.receive'],
  ['Administración', 'warehouses.update'],
];

export const myOwners = (can: (permission: string) => boolean): Owner[] => OWNER_PERMISSION.filter(([, permission]) => can(permission)).map(([owner]) => owner);

export type PendingItem = {
  row: ProcessRow;
  step: TrackingStep;
  /** The step does not block the process: another team is still working on the main one. */
  parallel: boolean;
};

/**
 * One pending item per process: the main next step when it is mine, otherwise the first parallel step I can take.
 * Steps whose destination the user cannot open are left out, so every button leads somewhere useful.
 */
export function pendingFor(rows: ProcessRow[], owners: Owner[], can: (permission: string) => boolean): PendingItem[] {
  const mine = (step: TrackingStep) => owners.includes(step.owner) && canOpenRoute(step.route, can);
  const items: PendingItem[] = [];
  for (const row of rows) {
    if (row.completed) continue;
    if (row.nextStep && mine(row.nextStep)) { items.push({ row, step: row.nextStep, parallel: false }); continue; }
    const parallel = (row.alsoAvailable ?? []).find(mine);
    if (parallel) items.push({ row, step: parallel, parallel: true });
  }
  // Main steps first (they hold the purchase), then the parallel ones; newest activity first inside each group.
  return items.sort((a, b) => Number(a.parallel) - Number(b.parallel) || Date.parse(b.row.updatedAt) - Date.parse(a.row.updatedAt));
}

/** Open processes that wait on someone else, so the panel can say the rest of the work is moving. */
export const waitingOnOthers = (rows: ProcessRow[], items: PendingItem[]) => rows.filter(row => !row.completed).length - new Set(items.map(item => item.row.anchor.id + ':' + item.row.anchor.type)).size;

/** The step of one process that the user can take: the main one when it is theirs, else a parallel step of their team. */
export function stepForUser(main: TrackingStep | null, also: TrackingStep[], owners: Owner[], can: (permission: string) => boolean): TrackingStep | null {
  const mine = [main, ...also].find((step): step is TrackingStep => !!step && owners.includes(step.owner) && canOpenRoute(step.route, can));
  return mine ?? main;
}
