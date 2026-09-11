import { getWorkspaceData } from '@/lib/data';
import { AuditWorkspace, AccessDenied } from '@/components/admin-workspace';

export default async function AuditPage() {
  const data = await getWorkspaceData();
  if (data.user.role !== 'admin') return <AccessDenied />;
  return <AuditWorkspace data={data} />;
}
