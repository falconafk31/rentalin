export const money = (value: number | string) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value));
export const shortMoney = (value: number) => value >= 1e9 ? `Rp ${(value/1e9).toLocaleString('id-ID',{maximumFractionDigits:1})} M` : `Rp ${(value/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})} jt`;
export const dateLabel = (value: string | Date) => new Date(value).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Jakarta'});
export const dateTimeLabel = (value: string | Date) => {
  const d = new Date(value);
  const dateStr = d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Jakarta'});
  const timeStr = d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Jakarta'}).replace('.',':');
  return `${dateStr}, ${timeStr} WIB`;
};
export const timeLabel = (value: string | Date) => {
  const d = new Date(value);
  const timeStr = d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Jakarta'}).replace('.',':');
  return `${timeStr} WIB`;
};
export const labels: Record<string,string> = {available:'Tersedia',renting:'Disewa',maintenance:'Perawatan',in_transit:'Dalam Mobilisasi',active:'Aktif',draft:'Draf',completed:'Selesai',pending:'Menunggu Persetujuan',approved:'Disetujui',rejected:'Ditolak',unpaid:'Belum Dibayar',partial:'Dibayar Sebagian',paid:'Lunas',overdue:'Jatuh Tempo',mobilization:'Mobilisasi',demobilization:'Demobilisasi',admin:'Administrator',operations:'Manajer Operasional',operator:'Operator',finance:'Staf Keuangan'};
export const todayISO = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA menghasilkan format YYYY-MM-DD sesuai waktu Indonesia
};
