import Link from 'next/link';
import { getSettingsTemplates } from '@/lib/data';
import { TemplatesWorkspace } from '@/components/template-workspace';
import { AccessDenied } from '@/components/admin-workspace';
// F1 (audit rute settings): halaman Template PDF dipisah dari tab Pengaturan
// menjadi rute statis sendiri /dashboard/settings/templates — admin-only.
export default async function TemplatesPage() {
  const data = await getSettingsTemplates();
  if (data.user.role !== 'admin') return <AccessDenied />;
  const publishedCount = Object.values(data.templates).filter(t => t.published).length;
  return (
    <div className="module-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span />RUANG KERJA OPERASIONAL</div>
          <h1>Template PDF</h1>
          <p>Kelola template dokumen PDF (SPH, BAST, Invoice, dan Perjanjian).</p>
        </div>
      </div>
      <div className="table-tabs" style={{ marginBottom: 20 }}>
        <Link href="/dashboard/settings">Perusahaan</Link>
        <Link className="active" href="/dashboard/settings/templates">Template PDF<span>{publishedCount}/4 tayang</span></Link>
      </div>
      <TemplatesWorkspace data={data.templates} canWrite />
    </div>
  );
}
