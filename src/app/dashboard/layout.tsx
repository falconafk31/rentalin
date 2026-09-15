import { getShellData } from '@/lib/data';
import { Shell } from '@/components/shell';

export const dynamic = 'force-dynamic';

// O-A: layout hanya memuat data shell ramping (user + settings + angka badge).
// Sebelumnya layout menarik 7 tabel penuh agar sidebar/topbar/pencarian global hidup.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const data = await getShellData();
  return <Shell data={data}>{children}</Shell>;
}


