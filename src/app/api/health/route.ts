import { db } from "@/db";
import { sql } from "drizzle-orm";
import { isConfigured, createAuthClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

// O10 (audit.md): health check diperluas — bukan sekadar `select 1`.
// Melaporkan latensi DB, keterjangkauan Supabase Auth, uptime proses,
// dan timestamp. Tanpa data sensitif (aman publik untuk monitor uptime).
const startedAt = Date.now();

export async function GET() {
  const t0 = Date.now();
  try {
    await db.execute(sql`select 1`);
    const dbLatencyMs = Date.now() - t0;
    let authReachable = false;
    if (isConfigured()) {
      try {
        const auth = await createAuthClient();
        await auth.auth.getUser();
        authReachable = true;
      } catch {
        authReachable = false;
      }
    }
    return Response.json({
      ok: true,
      db: { latencyMs: dbLatencyMs },
      auth: { configured: isConfigured(), reachable: authReachable },
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      ts: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        db: { latencyMs: Date.now() - t0 },
        error: ((error as Error).message || "database unreachable").slice(0, 140),
      },
      { status: 500 },
    );
  }
}
