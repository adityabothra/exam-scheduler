import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, RotateCcw, Square, Save, Info, ShieldCheck, ShieldAlert, AlertTriangle, CalendarDays, CheckCircle2, Cpu, SlidersHorizontal } from 'lucide-react';
import { toast } from 'react-toastify';
import { errMsg } from '../services/api';
import * as svc from '../services/optimizationService';
import useFetch from '../hooks/useFetch';
import Monitor from '../components/optimization/Monitor';
import useRunStream from '../components/optimization/useRunStream';
import { Badge, Card, ConfirmDialog, ErrorBox, Field, PageHeader, PageLoader, Spinner, Tabs } from '../components/common/UI';

const WEIGHT_INFO = {
  student: ['w1 - Student cost', 'Penalises students sitting several exams on one day or with little rest. Raise it to protect students from heavy days.'],
  faculty: ['w2 - Faculty cost', 'Penalises uneven invigilation duty, overload, and several duties on one day. Raise it to share invigilation more fairly.'],
  room: ['w3 - Room cost', 'Penalises wasted seats and unnecessary extra rooms. Raise it to fit exams into snugger rooms (multi-room use that is needed is never penalised).'],
  spacing: ['w4 - Spacing cost', 'Penalises short rest between a student\'s exams and uneven use of exam days. Raise it to spread exams more evenly across the dates.'],
};

export default function AIOptimizer() {
  const cfgQ = useFetch(() => svc.getConfig());
  const feas = useFetch(() => svc.feasibility(), [], { silent: true });
  const [cfg, setCfg] = useState(null);
  const [runId, setRunId] = useState(null);
  const [tab, setTab] = useState('config');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [startError, setStartError] = useState(null);
  const stream = useRunStream(runId);

  useEffect(() => { if (cfgQ.data && !cfg) setCfg(cfgQ.data.config); }, [cfgQ.data, cfg]);
  // resume watching a run that is still in progress after a page refresh
  useEffect(() => { svc.active().then((r) => { if (r.runId) { setRunId(r.runId); setTab('monitor'); } }).catch(() => {}); }, []);

  if (!cfg) return <PageLoader />;
  const live = ['running', 'paused', 'cancelling'].includes(stream.status) && !!runId;
  const f = feas.data;

  const setNum = (path, v) => {
    const val = v === '' ? '' : Number(v);
    if (path.startsWith('weights.')) setCfg({ ...cfg, weights: { ...cfg.weights, [path.slice(8)]: val } });
    else if (path.startsWith('costParams.')) setCfg({ ...cfg, costParams: { ...cfg.costParams, [path.slice(11)]: val } });
    else setCfg({ ...cfg, [path]: val });
  };

  const run = async () => {
    setBusy(true); setStartError(null);
    try {
      const { runId: id } = await svc.start(cfg);
      setRunId(id); setTab('monitor');
      toast.info(`Optimization run #${id} started`);
    } catch (e) {
      const d = e?.response?.data;
      setStartError(errMsg(e)); toast.error(errMsg(e));
      if (d?.details?.issues) feas.setData({ ok: false, issues: d.details.issues, summary: d.details.summary });
    } finally { setBusy(false); }
  };
  const ctl = async (fn, msg) => { try { await fn(runId); if (msg) toast.info(msg); } catch (e) { toast.error(errMsg(e)); } };
  const save = async () => { try { await svc.saveConfig(cfg); toast.success('Configuration saved as default'); } catch (e) { toast.error(errMsg(e)); } };
  const reset = async () => { try { const r = await svc.resetConfig(); setCfg(r.config); toast.success('Configuration reset to factory defaults'); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <>
      <PageHeader title="AI Optimizer" subtitle="Simulated Annealing runs on the server. It starts from a valid timetable, proposes neighbouring timetables, and accepts worse ones with probability exp(-ΔCost / T) while the temperature cools."
        actions={<>
          {!live && <><button className="btn-secondary" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset configuration</button><button className="btn-secondary" onClick={save}><Save className="h-4 w-4" /> Save as default</button>
            <button className="btn-primary" disabled={busy || (f && !f.ok)} onClick={run}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <Play className="h-4 w-4" />} Run Optimization</button></>}
          {live && <>
            {stream.status === 'paused' ? <button className="btn-primary" onClick={() => ctl(svc.resume, 'Resumed')}><Play className="h-4 w-4" /> Resume</button> : <button className="btn-secondary" onClick={() => ctl(svc.pause, 'Paused')}><Pause className="h-4 w-4" /> Pause</button>}
            <button className="btn-danger" onClick={() => setConfirmCancel(true)}><Square className="h-4 w-4" /> Cancel</button></>}
        </>} />

      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[['config', 'Configuration', SlidersHorizontal], ['monitor', 'AI Optimization Monitor', Cpu]]} /></div>
      {startError && <div className="mb-4"><ErrorBox message={startError} /></div>}

      {tab === 'config' && (
        <div className="space-y-6">
          {f && (
            <Card title="Feasibility check" actions={f.ok ? <Badge tone="green"><ShieldCheck className="h-3.5 w-3.5" /> A valid timetable can exist</Badge> : <Badge tone="red"><ShieldAlert className="h-3.5 w-3.5" /> Cannot run</Badge>}>
              {f.ok && !f.issues.length ? <p className="text-sm text-slate-600">{f.summary.examinations} examinations, {f.summary.usableSlots} usable slots, {f.summary.rooms} rooms ({f.summary.totalRoomCapacity} seats), {f.summary.faculty} faculty and {f.summary.students} students. No obstacles found.</p> : (
                <ul className="space-y-2">{f.issues.map((i, k) => <li key={k} className={`flex gap-2 rounded-lg border p-3 text-sm ${i.severity === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</li>)}</ul>)}
              {!f.ok && <p className="mt-3 text-sm text-slate-500">Fix these on the <Link className="font-medium text-brand-600 underline" to="/examinations">Examination Management</Link>, <Link className="font-medium text-brand-600 underline" to="/time-slots">Time Slots</Link> or <Link className="font-medium text-brand-600 underline" to="/rooms">Rooms</Link> pages. The optimizer will not produce an invalid timetable.</p>}
            </Card>)}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Simulated Annealing parameters">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Initial temperature (T0)" hint="Higher = accepts more worse moves early"><input className="input" type="number" step="any" value={cfg.initialTemperature} onChange={(e) => setNum('initialTemperature', e.target.value)} /></Field>
                <Field label="Minimum temperature" hint="Stops when T falls to this"><input className="input" type="number" step="any" value={cfg.minTemperature} onChange={(e) => setNum('minTemperature', e.target.value)} /></Field>
                <Field label="Cooling rate (α)" hint="T_new = α × T. Typically 0.90 - 0.99"><input className="input" type="number" step="0.001" min="0.5" max="0.999" value={cfg.coolingRate} onChange={(e) => setNum('coolingRate', e.target.value)} /></Field>
                <Field label="Maximum iterations"><input className="input" type="number" min="1" value={cfg.maxIterations} onChange={(e) => setNum('maxIterations', e.target.value)} /></Field>
                <Field label="Neighbour attempts per temperature"><input className="input" type="number" min="1" value={cfg.neighborsPerTemperature} onChange={(e) => setNum('neighborsPerTemperature', e.target.value)} /></Field>
                <Field label="Random seed (optional)" hint="Same seed = identical run"><input className="input" type="number" value={cfg.seed ?? ''} placeholder="random" onChange={(e) => setCfg({ ...cfg, seed: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                <Field label="Convergence window (levels)" hint="Stop if no improvement for N levels. 0 = off"><input className="input" type="number" min="0" value={cfg.convergenceLevels} onChange={(e) => setNum('convergenceLevels', e.target.value)} /></Field>
                <Field label="Monitor delay per level (ms)" hint="Slows the run so you can watch it. 0 = full speed"><input className="input" type="number" min="0" value={cfg.stepDelayMs} onChange={(e) => setNum('stepDelayMs', e.target.value)} /></Field>
              </div>
            </Card>
            <Card title="Optimization weights" subtitle="Cost = w1·C_student + w2·C_faculty + w3·C_room + w4·C_spacing">
              <div className="space-y-4">{Object.entries(WEIGHT_INFO).map(([k, [t, d]]) => (
                <div key={k}>
                  <div className="flex items-center justify-between"><span className="text-sm font-semibold">{t}</span><input className="input !w-24 text-right" type="number" step="0.1" min="0" value={cfg.weights[k]} onChange={(e) => setNum(`weights.${k}`, e.target.value)} /></div>
                  <input type="range" min="0" max="5" step="0.1" value={cfg.weights[k] || 0} onChange={(e) => setNum(`weights.${k}`, e.target.value)} className="mt-2 w-full accent-brand-500" />
                  <p className="mt-1 flex gap-1.5 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{d}</p>
                </div>))}</div>
            </Card>
            <Card title="Preferences used by the cost function" className="xl:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Min. preferred rest (hours)" hint="Gap between a student's exams"><input className="input" type="number" min="0" value={cfg.costParams.minSpacingHours} onChange={(e) => setNum('costParams.minSpacingHours', e.target.value)} /></Field>
                <Field label="Max exams per day (student)"><input className="input" type="number" min="1" value={cfg.costParams.maxExamsPerDay} onChange={(e) => setNum('costParams.maxExamsPerDay', e.target.value)} /></Field>
                <Field label="Max exam minutes per day"><input className="input" type="number" min="60" step="30" value={cfg.costParams.maxDailyMinutes} onChange={(e) => setNum('costParams.maxDailyMinutes', e.target.value)} /></Field>
                <Field label="Invigilators per room"><input className="input" type="number" min="1" max="5" value={cfg.costParams.invigilatorsPerRoom} onChange={(e) => setNum('costParams.invigilatorsPerRoom', e.target.value)} /></Field>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'monitor' && (!runId ? (
        <Card><div className="py-12 text-center text-sm text-slate-500"><Cpu className="mx-auto mb-3 h-8 w-8 text-slate-300" />No optimization is running. Configure the parameters and press <b>Run Optimization</b>.</div></Card>
      ) : (
        <>
          <Monitor stream={stream} config={cfg} />
          {stream.status === 'completed' && (
            <Card className="mt-6" title="Optimization complete">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={stream.result?.validation?.valid ? 'green' : 'red'}>{stream.result?.validation?.valid ? <><CheckCircle2 className="h-3.5 w-3.5" /> Independent validation passed - 0 hard violations</> : `${stream.result?.validation?.total} hard violation(s)`}</Badge>
                <div className="ml-auto flex gap-2"><Link to="/conflicts" className="btn-secondary">Conflict detection</Link><Link to="/timetable" className="btn-primary"><CalendarDays className="h-4 w-4" /> View timetable</Link></div>
              </div>
            </Card>)}
          {stream.status === 'failed' && stream.result?.infeasible && (
            <Card className="mt-6" title="No valid timetable could be built">
              <p className="mb-3 text-sm text-slate-600">{stream.result.error}</p>
              <ul className="space-y-2">{stream.result.infeasible.unscheduled.map((u) => <li key={u.code} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><b>{u.code} {u.name}</b> ({u.students} students): {u.reason}</li>)}</ul>
            </Card>)}
          {stream.status === 'failed' && !stream.result?.infeasible && <div className="mt-6"><ErrorBox message={stream.result?.error || 'The optimization failed.'} /></div>}
        </>
      ))}
      <ConfirmDialog open={confirmCancel} title="Cancel optimization?" confirmText="Cancel run" message="The run stops at its next checkpoint and no timetable is saved." onClose={() => setConfirmCancel(false)} onConfirm={() => { setConfirmCancel(false); ctl(svc.cancel, 'Cancelling...'); }} />
    </>
  );
}
