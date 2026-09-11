import Link from 'next/link';
import { FileSearch, ArrowLeft } from 'lucide-react';
export default function NotFound(){return <main className="verify-page"><section className="panel verify-card"><span className="verify-icon"><FileSearch size={32}/></span><h1>Halaman Tidak Ditemukan</h1><p>Halaman yang Anda cari tidak tersedia atau telah dipindahkan.</p><Link href="/dashboard" className="button button-primary" style={{marginTop:25}}><ArrowLeft size={16}/>Kembali ke Dasbor</Link></section></main>;}
