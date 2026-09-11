// Eksekusi best-effort (TASK-1B Finding 3). Thunk boleh gagal sinkron
// (mis. Proxy db melempar saat DATABASE_URL hilang) maupun asinkron
// (koneksi/query gagal) — kegagalan dicatat ke log server dan fallback
// dipakai. FUNGSI INI TAK PERNAH THROW. Pure, tanpa dependensi.
export async function withFallback<T>(task: () => Promise<T>, fallback: T, tag: string): Promise<T> {
  try {
    return await task();
  } catch (error) {
    console.error(`[${tag}] gagal, pakai fallback:`, (error as Error).message);
    return fallback;
  }
}
