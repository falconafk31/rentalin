import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/db';
import * as s from '@/db/schema';
import { inArray, asc } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { getDetailedFleetHistory, type DetailedFleetHistory } from '@/lib/fleet-history';
import { AllFleetsHistoryDocument } from '@/components/pdf-fleet-history';
import { dateLabel } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireUser();
  } catch (error) {
    if (((error as Error).message || '').includes('NEXT_REDIRECT')) throw error;
    return Response.json({ message: 'Anda tidak memiliki izin.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const unitsParam = url.searchParams.get('units');
  const unitIds = unitsParam ? unitsParam.split(',').filter((u) => u.trim().length > 0) : [];

  let fleetRows: { id: string }[] = [];
  if (unitIds.length > 0) {
    fleetRows = await db
      .select({ id: s.fleet.id })
      .from(s.fleet)
      .where(inArray(s.fleet.id, unitIds))
      .orderBy(asc(s.fleet.unitCode));
  } else {
    fleetRows = await db
      .select({ id: s.fleet.id })
      .from(s.fleet)
      .orderBy(asc(s.fleet.unitCode))
      .limit(50); // Batas wajar server-side agar memori PDF tidak meledak
  }

  if (fleetRows.length === 0) {
    return Response.json({ message: 'Tidak ada armada yang dipilih.' }, { status: 404 });
  }

  const fleetsData: DetailedFleetHistory[] = [];
  for (const f of fleetRows) {
    // allTimesheets: true agar dokumen riwayat armada memuat seluruh riwayat operasional lengkap
    const res = await getDetailedFleetHistory(f.id, { allTimesheets: true });
    if (!('error' in res)) {
      fleetsData.push(res);
    }
  }

  const [settings] = await db.select().from(s.companySettings).limit(1);
  const now = new Date();
  const printedAt = `${dateLabel(now.toISOString().slice(0, 10), settings?.timezone || 'WIB')} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;

  const buffer = await renderToBuffer(
    AllFleetsHistoryDocument({
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
      fleetsData,
      printedAt,
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Rekap-Riwayat-Armada.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}
