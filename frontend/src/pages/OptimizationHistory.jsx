import { useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Trash2, Eye, GitCompare } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'react-toastify';
import { errMsg } from '../services/api';
import * as svc from '../services/optimizationService';
import useFetch from '../hooks/useFetch';
import { CostTable } from '../components/optimization/Monitor';
import { Badge, Card, ConfirmDialog, DataTable, EmptyState, Modal, PageHeader, Spinner } from '../components/common/UI';
import { fmtDuration, num, pct } from '../utils/format';

const STATUS = { completed: 'green', running: 'indigo', paused: 'amber', failed: 'red', cancelled: 'slate' };
const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#e11d48', '#0ea5e9'];

function RunDetail({ id, onClose }) {
  const { data, loading } = useFetch(() => svc.getRun(id), [id], { silent: true });
  const r = data?.run;
  return (
    <Modal open onClose={onClose} size="xl" title={r ? `Run #${r.id} - ${r.name}` : 'Run'}>
      {loading || !r ? <Spinner className="mx-auto" /> : (
        <div className="space-y-5">
          <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[['Status', r.status], ['Termination', r.termination || '-'], ['Iterations', num(r.iterations, 0)], ['Accepted / rejected', `${r.accepted} / ${r.rejected}`], ['Invalid neighbours', r.invalid_neighbors], ['Time', r.duration_ms ? fmtDuration(r.duration_ms) : '-']].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{k}</p><p className="font-semibold">{v}</p></div>)}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div><p className="label">Parameters</p><dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {[['T0', r.config.initialTemperature], ['Tmin', r.config.minTemperature], ['Cooling α', r.config.coolingRate], ['Neighbours / level', r.config.neighborsPerTemperature], ['Seed', data.results.report?.seed ?? '-'], ['Weights (w1..w4)', Object.values(r.config.weights || {}).join(', ')]].map(([k, v]) => <><dt key={k} className="text-slate-500">{k}</dt><dd key={k + 'v'} className="font-mono">{v}</dd></>)}</dl></div>
            <div className="overflow-x-auto rounded-lg border border-slate-200"><CostTable initial={r.initial_breakdown} final={r.final_breakdown} /></div>
          </div>
          {data.results.series.length > 1 && <div className="h-64"><ResponsiveContainer><LineChart data={data.results.series}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="iteration" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend /><Line dot={false} dataKey="current" name="Current" stroke="#94a3b8" isAnimationActive={false} /><Line dot={false} dataKey="best" name="Best" stroke="#10b981" strokeWidth={2.5} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>}
          {r.error_message && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{r.error_message}</p>}
        </div>)}
    </Modal>
  );
}

export default function OptimizationHistory() {
  const { data: runs, loading, reload } = useFetch(() => svc.history(), [], { initial: [] });
  const [sel, setSel] = useState([]);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);
  const [cmp, setCmp] = useState(false);
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-4));
  const chosen = runs.filter((r) => sel.includes(r.id));

  return (
    <>
      <PageHeader title="Optimization History" subtitle="Every scheduling attempt is stored so you can compare configurations and results." actions={<button className="btn-primary" disabled={sel.length < 2} onClick={() => setCmp(true)}><GitCompare className="h-4 w-4" /> Compare selected ({sel.length})</button>} />
      <Card pad={false}>
        <DataTable loading={loading} rows={runs} empty={<EmptyState icon={History} title="No runs yet" message="Run the AI Optimizer to create the first one." action={<Link to="/optimizer" className="btn-primary">Open AI Optimizer</Link>} />}
          columns={[
            { key: 'c', header: '', render: (r) => <input type="checkbox" disabled={r.status !== 'completed'} checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /> },
            { key: 'id', header: 'Run', render: (r) => <span className="font-semibold">#{r.id}</span> }, { key: 'name', header: 'Name' },
            { key: 'status', header: 'Status', render: (r) => <div className="flex gap-1"><Badge tone={STATUS[r.status]}>{r.status}</Badge>{r.is_published && <Badge tone="green">published</Badge>}</div> },
            { key: 'initial_cost', header: 'Initial', render: (r) => num(r.initial_cost, 1) }, { key: 'final_cost', header: 'Optimized', render: (r) => <b>{num(r.final_cost, 1)}</b> },
            { key: 'imp', header: 'Improvement', render: (r) => (r.final_cost != null ? <span className="text-emerald-700">{pct(r.initial_cost, r.final_cost)}</span> : '-') },
            { key: 'iterations', header: 'Iterations', render: (r) => num(r.iterations, 0) }, { key: 'duration_ms', header: 'Time', render: (r) => (r.duration_ms != null ? fmtDuration(r.duration_ms) : '-') },
            { key: 'v', header: 'Validation', render: (r) => <Badge tone={r.validation_status === 'valid' ? 'green' : r.validation_status === 'invalid' ? 'red' : 'slate'}>{r.validation_status}</Badge> },
            { key: 'started_at', header: 'Started', render: (r) => String(r.started_at).slice(0, 16) },
            { key: 'a', header: '', className: 'text-right', render: (r) => <div className="flex justify-end gap-1"><button className="btn-ghost !p-1.5" onClick={() => setView(r.id)}><Eye className="h-4 w-4" /></button><button className="btn-ghost !p-1.5 text-rose-600" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button></div> },
          ]} />
      </Card>
      {view && <RunDetail id={view} onClose={() => setView(null)} />}
      <Modal open={cmp} onClose={() => setCmp(false)} size="xl" title="Compare runs">
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr><th className="th">Metric</th>{chosen.map((r, i) => <th key={r.id} className="th" style={{ color: COLORS[i] }}>Run #{r.id}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{[
            ['Initial cost', (r) => num(r.initial_cost, 2)], ['Optimized cost', (r) => num(r.final_cost, 2)], ['Improvement', (r) => pct(r.initial_cost, r.final_cost)],
            ['Student cost', (r) => num(r.final_breakdown?.student, 2)], ['Faculty cost', (r) => num(r.final_breakdown?.faculty, 2)], ['Room cost', (r) => num(r.final_breakdown?.room, 2)], ['Spacing cost', (r) => num(r.final_breakdown?.spacing, 2)],
            ['Iterations', (r) => num(r.iterations, 0)], ['Time', (r) => fmtDuration(r.duration_ms || 0)], ['Cooling α', (r) => r.config.coolingRate], ['T0 -> Tmin', (r) => `${r.config.initialTemperature} -> ${r.config.minTemperature}`],
            ['Weights w1..w4', (r) => Object.values(r.config.weights || {}).join(' / ')],
          ].map(([k, fn]) => <tr key={k}><td className="td font-medium">{k}</td>{chosen.map((r) => <td key={r.id} className="td font-mono">{fn(r)}</td>)}</tr>)}</tbody></table></div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} message={`Delete run #${del?.id} and its saved timetable?`} onConfirm={async () => { try { await svc.removeRun(del.id); toast.success('Run deleted'); setSel(sel.filter((x) => x !== del.id)); reload(); } catch (e) { toast.error(errMsg(e)); } setDel(null); }} />
    </>
  );
}
