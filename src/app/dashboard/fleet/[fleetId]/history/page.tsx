import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/db';
import * as s from '@/db/schema';
import { getDetailedFleetHistory } from '@/lib/fleet-history';
import { FleetHistoryView } from '@/components/fleet-history-view';

export const dynamic = 'force-dynamic';

export default async function FleetHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ fleetId: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { fleetId } = await params;
  const search = await searchParams;
  const user = await requireUser();

  const page = Math.max(1, Number(search.page) || 1);
  const history = await getDetailedFleetHistory(fleetId, { page, pageSize: 10 });
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
      initialTab={search.tab}
    />
  );
}
