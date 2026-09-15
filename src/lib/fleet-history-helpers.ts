/**
 * Pure business helpers for Fleet History calculation & validation.
 * Isolated from DB/I-O to allow reuse in both server runtime and automated testing.
 */

export interface HmIntervalLog {
  startHm: number | string;
  endHm: number | string;
}

/**
 * Total HM Terpakai:
 * Sum of valid meter reading intervals (endHm - startHm) where startHm >= 0 and endHm >= startHm.
 * Does NOT use global max(endHm) - min(startHm).
 */
export function calcTotalHmUsed(logs: HmIntervalLog[]): number {
  const sum = logs.reduce((acc, curr) => {
    const start = Number(curr.startHm);
    const end = Number(curr.endHm);
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start) {
      return acc + (end - start);
    }
    return acc;
  }, 0);
  return Math.round(sum * 100) / 100;
}

export interface StatusDateLog {
  date: string;
  status: string;
}

/**
 * Approved Work Days:
 * Count of DISTINCT dates with timesheet status = 'approved'.
 * Pending and rejected logs are strictly excluded from official fleet work days.
 */
export function calcApprovedWorkDays(logs: StatusDateLog[]): number {
  const approvedDates = new Set(
    logs.filter((l) => l.status === 'approved' && Boolean(l.date)).map((l) => l.date)
  );
  return approvedDates.size;
}

/**
 * Official Fleet Utilization (%):
 * (approvedWorkDays / contractDays) * 100
 * Clamped between 0 and 100%. Returns 0 if contractDays <= 0.
 */
export function calcFleetUtilization(approvedWorkDays: number, contractDays: number): number {
  if (!Number.isFinite(contractDays) || contractDays <= 0) return 0;
  if (!Number.isFinite(approvedWorkDays) || approvedWorkDays <= 0) return 0;
  const raw = (approvedWorkDays / contractDays) * 100;
  return Math.min(100, Math.round(raw));
}

export interface PaginationParams {
  totalRecords: number;
  page: number;
  pageSize: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  offset: number;
  limit: number;
}

/**
 * Server-side pagination calculation:
 * Ensures page number is clamped to [1, totalPages] and calculates offset & limit safely.
 */
export function calcPaginationParams({
  totalRecords,
  page,
  pageSize,
}: PaginationParams): PaginationResult {
  const size = Math.max(1, Math.min(100, Number(pageSize) || 10));
  const total = Math.max(0, Number(totalRecords) || 0);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const clampedPage = Math.max(1, Math.min(Number(page) || 1, totalPages));
  const offset = (clampedPage - 1) * size;

  return {
    page: clampedPage,
    pageSize: size,
    total,
    totalPages,
    offset,
    limit: size,
  };
}

export interface UserAuthContext {
  id: string;
  role: string;
}

export interface HandoverAuthContext {
  id: string;
  contractId: string;
  photoUrls: string[];
  assignedOperatorProfileIds?: string[];
}

/**
 * Entity-level authorization for BAST photos:
 * 1. Checks that the path is non-empty and starts with "handovers/".
 * 2. Verifies that the path is registered in handover.photoUrls.
 * 3. Verifies that the requesting user role is authorized:
 *    - 'admin', 'operations', 'finance': company-wide internal roles authorized to inspect equipment handover.
 *    - 'operator': authorized only if the operator is assigned to the contract or created the handover.
 *    - other roles: denied.
 */
export function isUserAuthorizedForBastPhoto(
  requestedPath: string,
  user: UserAuthContext,
  handover: HandoverAuthContext
): boolean {
  if (!requestedPath || typeof requestedPath !== 'string' || !requestedPath.startsWith('handovers/')) {
    return false;
  }

  // Must be registered in this specific handover's photos
  if (!Array.isArray(handover.photoUrls) || !handover.photoUrls.includes(requestedPath)) {
    return false;
  }

  // Admin, operations, and finance have internal operational oversight
  if (['admin', 'operations', 'finance'].includes(user.role)) {
    return true;
  }

  // Operator role: authorized if assigned to this contract
  if (user.role === 'operator') {
    if (handover.assignedOperatorProfileIds && handover.assignedOperatorProfileIds.includes(user.id)) {
      return true;
    }
    // If not specifically assigned, operator role is restricted
    return false;
  }

  return false;
}
