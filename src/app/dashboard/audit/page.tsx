import { getAuditData } from '@/lib/data';
import { AuditWorkspace, AccessDenied } from '@/components/admin-workspace';

export default async function AuditPage() {
  // O-A: data ramping (user + 200 log terbaru saja).
  const data = await getAuditData();
  if (data.user.role !== 'admin') return <AccessDenied />;
  return <AuditWorkspace data={data} />;
}
