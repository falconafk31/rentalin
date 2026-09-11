// Formatter Intl di-cache pada level modul + zona waktu perusahaan (WIB/WITA/WIT).
//
// Konstruksi Intl.NumberFormat / Intl.DateTimeFormat itu mahal, dan fungsi di
// bawah dipanggil ratusan kali setiap kali tabel di-render. Formatter di-cache
// SATU kali per zona waktu (bukan per panggilan), sehingga biayanya nol.
const idrFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

// Zona waktu dokumen (dapat dikonfigurasi perusahaan di Pengaturan).
// Default WIB; perusahaan di Indonesia tengah/timur memakai WITA/WIT agar
// "hari ini" (badge jatuh tempo, validasi form, tanggal dokumen) mengikuti
// kalender lokal — bukan selalu kalender Jakarta.
export type AppTimezone = 'WIB' | 'WITA' | 'WIT';
export const TIMEZONE_IANA: Record<AppTimezone, string> = { WIB: 'Asia/Jakarta', WITA: 'Asia/Makassar', WIT: 'Asia/Jayapura' };
export const resolveTz = (tz?: string | null): AppTimezone => (tz === 'WITA' || tz === 'WIT' ? tz : 'WIB');

type TzFormatters = {
  day: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  full: Intl.DateTimeFormat;
  isoDay: Intl.DateTimeFormat;
};
const tzFormatterCache = new Map<AppTimezone, TzFormatters>();
const formatters = (tz?: string | null): TzFormatters => {
  const key = resolveTz(tz);
  let f = tzFormatterCache.get(key);
  if (!f) {
    const zone = TIMEZONE_IANA[key];
    f = {
      day: new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: zone }),
      time: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }),
      full: new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: zone }),
      isoDay: new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }),
    };
    tzFormatterCache.set(key, f);
  }
  return f;
};

const clock = (value: string | Date, tz?: string | null) => formatters(tz).time.format(new Date(value)).replace('.', ':');

export const money = (value: number | string) => idrFormatter.format(Number(value));
export const shortMoney = (value: number) => value >= 1e9 ? `Rp ${compactFormatter.format(value / 1e9)} M` : `Rp ${compactFormatter.format(value / 1e6)} jt`;
export const dateLabel = (value: string | Date, tz?: string | null) => formatters(tz).day.format(new Date(value));
export const dateTimeLabel = (value: string | Date, tz?: string | null) => `${dateLabel(value, tz)}, ${clock(value, tz)} ${resolveTz(tz)}`;
export const timeLabel = (value: string | Date, tz?: string | null) => `${clock(value, tz)} ${resolveTz(tz)}`;
// Tanggal panjang berhari ("Jumat, 11 September 2026") untuk pembuka dokumen
// resmi (BAST). String 'YYYY-MM-DD' diparse UTC tengah malam; formatter memakai
// zona positif (WIB/WITA/WIT) sehingga tanggal kalendernya tetap sama — aman.
export const fullDateLabel = (value: string | Date, tz?: string | null) => formatters(tz).full.format(new Date(value));
export const labels: Record<string,string> = {available:'Tersedia',renting:'Disewa',maintenance:'Perawatan',in_transit:'Dalam Mobilisasi',active:'Aktif',draft:'Draf',completed:'Selesai',pending:'Menunggu Persetujuan',approved:'Disetujui',rejected:'Ditolak',unpaid:'Belum Dibayar',partial:'Dibayar Sebagian',paid:'Lunas',overdue:'Jatuh Tempo',mobilization:'Mobilisasi',demobilization:'Demobilisasi',admin:'Administrator',operations:'Manajer Operasional',operator:'Operator',finance:'Staf Keuangan',transfer:'Transfer Bank',cash:'Tunai',giro:'Giro / Cek',other:'Lainnya',banned:'Nonaktif',WIB:'WIB (Jakarta)',WITA:'WITA (Makassar)',WIT:'WIT (Jayapura)'};
export const todayISO = (tz?: string | null) => formatters(tz).isoDay.format(new Date());

// --- Aritmetika kalender TZ-aman (O-D) ------------------------------------
// JANGAN bandingkan tanggal ISO dengan new Date('YYYY-MM-DD') — itu diparse
// sebagai UTC sehingga di WIB (UTC+7) bisa geser ±1 hari. Fungsi di bawah
// murni menghitung selisih hari kalender dari komponen y/m/d.
const DAY_MS = 86400000;
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
/** Selisih hari kalender (zona perusahaan): positif = di masa depan, negatif = lewat. */
export const daysUntil = (isoDate: string, tz?: string | null) => dayNumber(isoDate) - dayNumber(todayISO(tz));
/** True bila tanggal sudah lewat hari ini (jatuh tempo). */
export const isPastDue = (isoDate: string, tz?: string | null) => daysUntil(isoDate, tz) < 0;
/** True bila tanggal berada dalam `warnDays` ke depan ATAU sudah lewat. */
export const isExpiringSoon = (isoDate: string | null | undefined, warnDays: number, tz?: string | null) => !!isoDate && daysUntil(isoDate, tz) <= warnDays;
