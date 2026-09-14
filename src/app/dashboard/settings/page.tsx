import { getSettingsData } from '@/lib/data';
import { SettingsWorkspace } from '@/components/settings-workspace';
import { AccessDenied } from '@/components/admin-workspace';
// F1 (audit rute settings): rute statis Pengaturan (profil perusahaan) — guard
// admin di level halaman, pola sama dengan users/audit. Menggantikan rute
// dinamis /dashboard/[module] dengan module==='settings'.
export default async function SettingsPage() {
  const data = await getSettingsData();
  if (data.user.role !== 'admin') return <AccessDenied />;
  return <SettingsWorkspace data={data} />;
}
