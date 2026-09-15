import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/db';
import * as s from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { getDetailedFleetHistory } from '@/lib/fleet-history';
import { SingleFleetHistoryDocument } from '@/components/pdf-fleet-history';
import { dateLabel } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ fleetId: string }> }) {
  const { fleetId } = await params;
  try {
    await requireUser();
  } catch (error) {
    if (((error as Error).message || '').includes('NEXT_REDIRECT')) throw error;
    return Response.json({ message: 'Anda tidak memiliki izin.' }, { status: 403 });
  }

  const historyRes = await getDetailedFleetHistory(fleetId, { page: 1, pageSize: 50 });
  if ('error' in historyRes) {
    return Response.json({ message: 'Data riwayat armada tidak ditemukan.' }, { status: 404 });
  }

  const [settings] = await db.select().from(s.companySettings).limit(1);
  const now = new Date();
  const printedAt = `${dateLabel(now.toISOString().slice(0, 10), settings?.timezone || 'WIB')} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;

  const buffer = await renderToBuffer(
    SingleFleetHistoryDocument({
      settings: settings || {
        id: 'main',
        companyName: 'PT Penyewaan Alat Berat',
        address: 'Jakarta, Indonesia',
        email: 'operasional@heavyops.id',
        phone: '+62 21 555 0128',
        signerName: '',
        signerTitle: '',
        ppnRate: '11',
        expiryWarningDays: 30,
        city: 'Jakarta',
        timezone: 'WIB',
        npwp: '',
        signerKtp: '',
        bankName: '',
        bankAccountName: '',
        bankAccountNumber: '',
      },
      data: historyRes,
      printedAt,
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Riwayat-${historyRes.unit.unitCode}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
