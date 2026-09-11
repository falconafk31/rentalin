'use client';
import { TriangleAlert } from 'lucide-react';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="empty-state panel"><span><TriangleAlert size={30}/></span><h2>Data belum dapat dimuat</h2><p>Periksa koneksi dan hak akses Anda, kemudian coba kembali.</p><button className="button button-primary" onClick={reset}>Coba Kembali</button></div>;}
