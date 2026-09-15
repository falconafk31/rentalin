import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/db';
import * as s from '@/db/schema';
import { getDetailedFleetHistory } from '@/lib/fleet-history';
import { FleetHistoryView } from '@/components/fleet-history-view';

export const dynamic = 'force-dynamic';

export default async function FleetHistoryPage({
  params,
}: {
  params: Promise<{ fleetId: string }>;
}) {
  const { fleetId } = await params;
  const user = await requireUser();

  const history = await getDetailedFleetHistory(fleetId, { page: 1, pageSize: 50 });
  if ('error' in history) {
    notFound();
  }

  const [settings] = await db.select().from(s.companySettings).limit(1);
  const timezone = settings?.timezone || 'WIB';

  return (
    <FleetHistoryView
      data={history}
      timezone={timezone}
      userRole={user.role}
    />
  );
}
