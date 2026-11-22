import { useEffect, useRef } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Thermometer, TrendingDown, Target, Percent, CheckCircle2, XCircle, Layers, Timer, Hash } from 'lucide-react';
import { Badge, Card } from '../common/UI';
import { fmtDuration, num, pct } from '../../utils/format';

const Metric = ({ icon: Icon, label, value, tone = 'text-brand-600' }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><Icon className={`h-3.5 w-3.5 ${tone}`} />{label}</div>
    <p className="mt-1 font-mono text-xl font-semibold text-ink">{value}</p>
  </div>
);

const LOG_STYLE = { info: 'text-slate-600', accept: 'text-emerald-700', reject: 'text-slate-400', success: 'text-brand-700 font-semibold', temperature: 'text-sky-700', warning: 'text-amber-700' };

export function CostTable({ initial, final }) {
  const rows = [['Student Cost', 'student'], ['Faculty Cost', 'faculty'], ['Room Cost', 'room'], ['Spacing Cost', 'spacing'], ['Total Cost', 'total']];
  return (
    <table className="min-w-full text-sm">
      <thead><tr><th className="th">Cost component</th><th className="th text-right">Initial</th><th className="th text-right">Optimized</th><th className="th text-right">Improvement</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map(([l, k]) => (
        <tr key={k} className={k === 'total' ? 'bg-slate-50 font-semibold' : ''}><td className="td">{l}</td><td className="td text-right font-mono">{initial ? num(initial[k], 2) : '-'}</td><td className="td text-right font-mono">{final ? num(final[k], 2) : '-'}</td><td className="td text-right font-mono text-emerald-700">{initial && final ? pct(initial[k], final[k]) : '-'}</td></tr>))}</tbody>
    </table>
  );
}

export default function Monitor({ stream, config }) {
  const { status, last, logs, points, result } = stream;
  const logRef = useRef();
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs.length]);

  const done = ['completed', 'failed', 'cancelled'].includes(status);
  const pctDone = done && status === 'completed' ? 100 : last?.percent ?? 0;
  const tone = { running: 'indigo', paused: 'amber', completed: 'green', failed: 'red', cancelled: 'slate', cancelling: 'amber' }[status] || 'slate';
  const fin = result?.finalBreakdown || (done ? last?.bestBreakdown : null);
  const init = result?.initialBreakdown || last?.initialBreakdown;

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Badge tone={tone}><span className={`h-1.5 w-1.5 rounded-full ${status === 'running' ? 'animate-pulse bg-brand-500' : 'bg-current'}`} />{status}</Badge>
          {result?.termination && <Badge>stopped: {result.termination.replace('_', ' ')}</Badge>}
          {result?.seed !== undefined && <Badge><Hash className="h-3 w-3" />seed {result.seed}</Badge>}
          <span className="ml-auto font-mono text-sm font-semibold text-slate-700">{num(pctDone, 1)}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-500 transition-all duration-300" style={{ width: `${pctDone}%` }} /></div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric icon={Activity} label="Iteration" value={num(last?.iteration ?? 0, 0)} />
        <Metric icon={Thermometer} label="Temperature" value={num(last?.temperature, 3)} tone="text-rose-500" />
        <Metric icon={TrendingDown} label="Current cost" value={num(last?.currentCost, 2)} />
        <Metric icon={Target} label="Best cost" value={num(last?.bestCost, 2)} tone="text-emerald-600" />
        <Metric icon={Percent} label="Acceptance prob." value={last ? num(last.acceptanceProbability, 4) : '-'} tone="text-violet-600" />
        <Metric icon={CheckCircle2} label="Accepted" value={num(last?.accepted ?? 0, 0)} tone="text-emerald-600" />
        <Metric icon={XCircle} label="Rejected" value={num(last?.rejected ?? 0, 0)} tone="text-slate-500" />
        <Metric icon={Layers} label="Valid neighbours" value={num(last?.validNeighbors ?? 0, 0)} />
        <Metric icon={Layers} label="Invalid (discarded)" value={num(last?.invalidNeighbors ?? 0, 0)} tone="text-amber-600" />
        <Metric icon={Timer} label="Execution time" value={fmtDuration(last?.elapsedMs ?? 0)} />
      </div>

      <Card title="Live optimization chart" subtitle="Iteration vs current cost, best cost and temperature (right axis)">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="iteration" fontSize={12} type="number" domain={[0, 'dataMax']} />
              <YAxis yAxisId="c" fontSize={12} label={{ value: 'Cost', angle: -90, position: 'insideLeft', fontSize: 12 }} />
              <YAxis yAxisId="t" orientation="right" fontSize={12} label={{ value: 'Temperature', angle: 90, position: 'insideRight', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v) => num(v, 3)} />
              <Legend />
              <Line yAxisId="c" dataKey="current" name="Current cost" stroke="#94a3b8" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line yAxisId="c" dataKey="best" name="Best cost" stroke="#10b981" dot={false} strokeWidth={2.5} isAnimationActive={false} />
              <Line yAxisId="t" dataKey="temperature" name="Temperature" stroke="#f43f5e" dot={false} strokeWidth={1.5} strokeDasharray="5 4" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Cost breakdown" subtitle="Cost = w1*C_student + w2*C_faculty + w3*C_room + w4*C_spacing" pad={false}>
          <div className="overflow-x-auto"><CostTable initial={init} final={fin} /></div>
          {last?.currentBreakdown && !fin && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Optimized column shows the best solution found so far once the run finishes.</p>}
        </Card>
        <Card title="Optimization activity log" subtitle="Real events emitted by the running algorithm" pad={false}>
          <div ref={logRef} className="h-72 overflow-y-auto bg-slate-950 p-3 font-mono text-xs leading-relaxed">
            {!logs.length && <p className="text-slate-500">Waiting for the algorithm to start...</p>}
            {logs.map((l, i) => (
              <div key={i} className={`${LOG_STYLE[l.level] || 'text-slate-300'} brightness-150`}><span className="select-none text-slate-600">Iteration {l.iteration}: </span>{l.message}</div>))}
          </div>
        </Card>
      </div>
    </div>
  );
}
