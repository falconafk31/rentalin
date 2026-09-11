import { getWorkspaceData } from '@/lib/data';
import { UsersWorkspace, AccessDenied } from '@/components/admin-workspace';

export default async function UsersPage() {
  const data = await getWorkspaceData();
  if (data.user.role !== 'admin') return <AccessDenied />;
  return <UsersWorkspace data={data} />;
}
