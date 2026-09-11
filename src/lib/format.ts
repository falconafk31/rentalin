// Formatter Intl di-cache pada level modul.
//
// Konstruksi Intl.NumberFormat / Intl.DateTimeFormat itu mahal, dan fungsi di
// bawah dipanggil ratusan kali setiap kali tabel di-render. Sebelumnya setiap
// panggilan membuat formatter baru dari nol — salah satu penyebab utama
// setiap ketikan pada kolom pencarian terasa laggy.
const idrFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const dayFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
const timeFormatter = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });
const isoDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });

const clock = (value: string | Date) => timeFormatter.format(new Date(value)).replace('.', ':');

export const money = (value: number | string) => idrFormatter.format(Number(value));
export const shortMoney = (value: number) => value >= 1e9 ? `Rp ${compactFormatter.format(value / 1e9)} M` : `Rp ${compactFormatter.format(value / 1e6)} jt`;
export const dateLabel = (value: string | Date) => dayFormatter.format(new Date(value));
export const dateTimeLabel = (value: string | Date) => `${dayFormatter.format(new Date(value))}, ${clock(value)} WIB`;
export const timeLabel = (value: string | Date) => `${clock(value)} WIB`;
export const labels: Record<string,string> = {available:'Tersedia',renting:'Disewa',maintenance:'Perawatan',in_transit:'Dalam Mobilisasi',active:'Aktif',draft:'Draf',completed:'Selesai',pending:'Menunggu Persetujuan',approved:'Disetujui',rejected:'Ditolak',unpaid:'Belum Dibayar',partial:'Dibayar Sebagian',paid:'Lunas',overdue:'Jatuh Tempo',mobilization:'Mobilisasi',demobilization:'Demobilisasi',admin:'Administrator',operations:'Manajer Operasional',operator:'Operator',finance:'Staf Keuangan',transfer:'Transfer Bank',cash:'Tunai',giro:'Giro / Cek',other:'Lainnya'};
export const todayISO = () => isoDayFormatter.format(new Date());

// --- Aritmetika kalender TZ-aman (O-D) ------------------------------------
// JANGAN bandingkan tanggal ISO dengan new Date('YYYY-MM-DD') — itu diparse
// sebagai UTC sehingga di WIB (UTC+7) bisa geser ±1 hari. Fungsi di bawah
// murni menghitung selisih hari kalender dari komponen y/m/d.
const DAY_MS = 86400000;
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
/** Selisih hari kalender (WIB): positif = di masa depan, negatif = lewat. */
export const daysUntil = (isoDate: string) => dayNumber(isoDate) - dayNumber(todayISO());
/** True bila tanggal sudah lewat hari ini (jatuh tempo). */
export const isPastDue = (isoDate: string) => daysUntil(isoDate) < 0;
/** True bila tanggal berada dalam `warnDays` ke depan ATAU sudah lewat. */
export const isExpiringSoon = (isoDate: string | null | undefined, warnDays: number) => !!isoDate && daysUntil(isoDate) <= warnDays;
