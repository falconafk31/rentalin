import Script from 'next/script';
import { getShellData } from '@/lib/data';
import { Shell, DASHBOARD_THEME_KEY } from '@/components/shell';

export const dynamic = 'force-dynamic';

const dashboardThemeBootScript = `(() => {
  try {
    if (window.localStorage.getItem('${DASHBOARD_THEME_KEY}') === 'dark') {
      const el = document.querySelector('.app-shell');
      if (el) {
        el.classList.add('dashboard-dark');
      } else {
        const observer = new MutationObserver(() => {
          const target = document.querySelector('.app-shell');
          if (target) {
            target.classList.add('dashboard-dark');
            observer.disconnect();
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    }
  } catch (_) {}
})();`;

// O-A: layout hanya memuat data shell ramping (user + settings + angka badge).
// Sebelumnya layout menarik 7 tabel penuh agar sidebar/topbar/pencarian global hidup.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const data = await getShellData();
  return (
    <>
      <Script id="dashboard-theme-boot" strategy="beforeInteractive">
        {dashboardThemeBootScript}
      </Script>
      <Shell data={data}>{children}</Shell>
    </>
  );
}

