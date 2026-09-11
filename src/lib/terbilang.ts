// Terbilang — angka ke kata Bahasa Indonesia (murni, tanpa dependensi).
// Dipakai dokumen resmi (Surat Perjanjian Sewa): "selama 91 (sembilan puluh
// satu) hari", "Rp350.000 (tiga ratus lima puluh ribu rupiah)".
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function bilangan(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${bilangan(n - 10)} belas`;
  if (n < 100) return `${bilangan(Math.floor(n / 10))} puluh${n % 10 ? ` ${bilangan(n % 10)}` : ''}`;
  if (n < 200) return `seratus${n % 100 ? ` ${bilangan(n % 100)}` : ''}`;
  if (n < 1000) return `${bilangan(Math.floor(n / 100))} ratus${n % 100 ? ` ${bilangan(n % 100)}` : ''}`;
  if (n < 2000) return `seribu${n % 1000 ? ` ${bilangan(n % 1000)}` : ''}`;
  if (n < 1e6) return `${bilangan(Math.floor(n / 1000))} ribu${n % 1000 ? ` ${bilangan(n % 1000)}` : ''}`;
  if (n < 1e9) return `${bilangan(Math.floor(n / 1e6))} juta${n % 1e6 ? ` ${bilangan(n % 1e6)}` : ''}`;
  if (n < 1e12) return `${bilangan(Math.floor(n / 1e9))} miliar${n % 1e9 ? ` ${bilangan(n % 1e9)}` : ''}`;
  return `${bilangan(Math.floor(n / 1e12))} triliun${n % 1e12 ? ` ${bilangan(n % 1e12)}` : ''}`;
}

/** Bilangan bulat → kata ("350000" → "tiga ratus lima puluh ribu"). */
export const angkaKeKata = (value: number | string): string => {
  const n = Math.floor(Math.abs(Number(value) || 0));
  return n === 0 ? 'nol' : bilangan(n);
};

/** Nominal rupiah → kata + "rupiah" ("350000.00" → "tiga ratus lima puluh ribu rupiah"). */
export const rupiahKeKata = (value: number | string): string => `${angkaKeKata(Number(value) || 0)} rupiah`;
