'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import { money } from '@/lib/format';

// recharts adalah paket JS terbesar di aplikasi — dipisah ke modul sendiri agar
// bisa dimuat lazy (next/dynamic, ssr:false) dan tidak membebani first paint.
export function RevenueChart({ data }: { data: { name: string; current: number; previous: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 15, right: 14, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f47727" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f47727" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9e9e7" />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#959593', fontSize: 13 }} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#959593', fontSize: 12 }} tickFormatter={v => `${v} jt`} tickCount={5} />
        <Tooltip contentStyle={{ border: '1px solid #e9e8e5', borderRadius: 10, fontSize: 14, boxShadow: '0 6px 24px #0000000a' }} formatter={(value, name) => [money(Number(value) * 1e6), name === 'current' ? 'Pendapatan' : 'Bulan sebelumnya']} />
        <Area isAnimationActive={false} type="monotone" dataKey="previous" stroke="#c8cece" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
        <Area isAnimationActive={false} type="monotone" dataKey="current" stroke="#f47727" strokeWidth={3} fill="url(#revenue-fill)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 3 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FleetDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie isAnimationActive={false} data={data} dataKey="value" innerRadius={69} outerRadius={89} startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={4} cornerRadius={4}>
          {data.map(s => <Cell key={s.name} fill={s.color} />)}
        </Pie>
        <Tooltip formatter={(v, n) => [`${v} unit`, n]} contentStyle={{ borderRadius: 8, fontSize: 14 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
