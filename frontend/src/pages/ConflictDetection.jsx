import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, RefreshCw, Rocket, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Badge, Card, DataTable, EmptyState, PageHeader, PageLoader, Select, Spinner } from '../components/common/UI';
import { CONFLICT_COLORS, CONFLICT_LABELS, fmtDate } from '../utils/format';

export default function ConflictDetection() {
  const runs = useFetch(() => api.get('/optimization/history').then((r) => r.data.filter((x) => x.status === 'completed')), [], { initial: [] });
  const [runId, setRunId] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, reload, error } = useFetch(() => api.get('/schedule/validate', { params: { runId: runId || undefined } }).then((r) => r.data), [runId], { silent: true });
  const act = async (fn, msg) => { setBusy(true); try { await fn(); toast.success(msg); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); runs.reload(); reload(); } };

  const list = (data?.conflicts || []).filter((c) => !filter || c.type === filter);
  const cur = runs.data.find((r) => r.id === data?.runId);

  return (
    <>
      <PageHeader title="Conflict Detection" subtitle="Independent validation: the stored timetable is re-read from MySQL and every hard constraint is re-checked by a separate validator - the optimizer is not trusted."
        actions={<><button className="btn-secondary" disabled={busy || loading} onClick={() => act(reload, 'Validation re-run')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Validate again</button>
          {cur?.is_published ? <button className="btn-secondary" disabled={busy} onClick={() => act(() => api.post('/schedule/unpublish', null, { params: { runId: data.runId } }), 'Timetable unpublished')}><EyeOff className="h-4 w-4" /> Unpublish</button>
            : <button className="btn-primary" disabled={busy || !data?.valid} title={data?.valid ? '' : 'Resolve all hard violations first'} onClick={() => act(() => api.post('/schedule/publish', null, { params: { runId: data.runId } }), 'Timetable published')}><Rocket className="h-4 w-4" /> Publish timetable</button>}</>} />
      {runs.data.length > 1 && <div className="mb-4 w-80"><Select value={runId} onChange={setRunId} placeholder="Current timetable" options={runs.data.map((r) => [r.id, `Run #${r.id} - ${r.name}${r.is_published ? ' (published)' : ''}`])} /></div>}

      {loading && !data ? <PageLoader label="Validating timetable..." /> : error && !data ? <Card><EmptyState icon={ShieldCheck} title="Nothing to validate" message={error} action={<Link className="btn-primary" to="/optimizer">Open AI Optimizer</Link>} /></Card> : data && (
        <>
          <Card className={`mb-6 ${data.valid ? 'border-emerald-300 bg-emerald-50/50' : 'border-rose-300 bg-rose-50/50'}`}>
            <div className="flex flex-wrap items-center gap-4">
              {data.valid ? <ShieldCheck className="h-10 w-10 text-emerald-600" /> : <ShieldAlert className="h-10 w-10 text-rose-600" />}
              <div><p className="text-lg font-bold text-ink">{data.valid ? 'All hard constraints satisfied' : `${data.total} hard-constraint violation(s) found`}</p>
                <p className="text-sm text-slate-600">Run #{data.runId} - {data.checkedExaminations} examinations checked. {data.valid ? 'This timetable can be published.' : 'Publishing is blocked until every violation is resolved.'}</p></div>
              {cur && <div className="ml-auto flex gap-2"><Badge tone={cur.is_published ? 'green' : 'amber'}>{cur.is_published ? 'Published' : 'Draft'}</Badge></div>}
            </div>
            {!data.valid && <div className="mt-4 flex flex-wrap gap-2"><button className={`rounded-full px-3 py-1 text-xs font-medium ${!filter ? 'bg-ink text-white' : 'bg-white ring-1 ring-slate-300'}`} onClick={() => setFilter('')}>All ({data.total})</button>
              {Object.entries(data.counts).map(([t, n]) => <button key={t} onClick={() => setFilter(filter === t ? '' : t)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === t ? 'text-white' : 'bg-white ring-1 ring-slate-300'}`} style={filter === t ? { background: CONFLICT_COLORS[t] } : { color: CONFLICT_COLORS[t] }}>{CONFLICT_LABELS[t] || t} ({n})</button>)}</div>}
          </Card>
          {!data.valid && (
            <Card pad={false} title="Conflicts">
              <DataTable rowKey="k" rows={list.map((c, i) => ({ ...c, k: i }))} columns={[
                { key: 'type', header: 'Type', render: (c) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium"><span className="h-2 w-2 rounded-full" style={{ background: CONFLICT_COLORS[c.type] }} />{c.label}</span> },
                { key: 'subject_code', header: 'Examination', render: (c) => (c.subject_code ? <span className="font-mono text-xs font-semibold">{c.subject_code}{c.other_subject_code ? ` / ${c.other_subject_code}` : ''}</span> : '-') },
                { key: 'related', header: 'Related', render: (c) => (c.related ? <span className="text-xs"><Badge>{c.related.type}</Badge> {c.related.name}</span> : '-') },
                { key: 'date', header: 'When', render: (c) => (c.date ? <span className="whitespace-nowrap text-xs">{fmtDate(c.date)}<br />{c.time}</span> : '-') },
                { key: 'explanation', header: 'Explanation', className: 'min-w-72' }, { key: 'suggestion', header: 'Suggested resolution', className: 'min-w-72 text-emerald-800' },
              ]} />
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">Fix these by editing the examination on the <Link className="font-medium text-brand-600 underline" to="/timetable">Timetable</Link> page, or re-run the optimizer.</p>
            </Card>)}
        </>)}
    </>
  );
}
