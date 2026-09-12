import { getDashboardData } from '@/lib/data';
import { Overview } from '@/components/overview';
// O-A: dasbor memakai agregat SQL (SUM/GROUP BY bulan) + daftar terbaru
// terbatas — bukan lagi seluruh 7 tabel.
export default async function DashboardPage(){return <Overview data={await getDashboardData()}/>}
