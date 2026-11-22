import { useState } from 'react';
import { ClipboardList, Wand2, Trash2, Pencil, ShieldCheck, AlertTriangle, XCircle, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Badge, Card, ConfirmDialog, DataTable, EmptyState, Field, Modal, PageHeader, PageLoader, Select, Spinner } from '../components/common/UI';

export default function Examinations() {
  const { data, loading, reload } = useFetch(() => api.get('/examinations').then((r) => r.data));
  const feas = useFetch(() => api.get('/examinations/feasibility').then((r) => r.data), [], { silent: true });
  const subjects = useFetch(() => api.get('/subjects').then((r) => r.data), [], { initial: [], silent: true });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [edit, setEdit] = useState(null);
  const [add, setAdd] = useState('');
  const refresh = () => { reload(); feas.reload(); subjects.reload(); };
  const act = async (fn, msg) => { setBusy(true); try { const r = await fn(); toast.success(typeof msg === 'function' ? msg(r) : msg); refresh(); return true; } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); } };

  if (loading && !data) return <PageLoader />;
  const exams = data?.examinations || [];
  const f = feas.data;
  const inPeriod = new Set(exams.map((e) => e.subject_id));

  return (
    <>
      <PageHeader title="Examination Management" subtitle={data?.period ? `Examination events for ${data.period.name}. Each event is one subject whose students must all be scheduled.` : 'Create an examination period first.'}
        actions={data?.period && <button className="btn-primary" disabled={busy} onClick={() => act(() => api.post('/examinations/generate', {}).then((r) => r.data), (r) => r.message)}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <Wand2 className="h-4 w-4" />} Generate from subjects</button>} />

      {f && (
        <Card className="mb-6" title="Pre-flight feasibility check" subtitle="Explains up front whether a valid timetable can exist"
          actions={f.ok ? <Badge tone="green"><ShieldCheck className="h-3.5 w-3.5" /> Feasible</Badge> : <Badge tone="red"><XCircle className="h-3.5 w-3.5" /> Not feasible</Badge>}>
          <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[['Exams', f.summary.examinations], ['Usable slots', f.summary.usableSlots], ['Rooms / seats', `${f.summary.rooms} / ${f.summary.totalRoomCapacity}`], ['Faculty', f.summary.faculty], ['Students', f.summary.students], ['Largest clash group', f.summary.largestConflictGroup]].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{k}</p><p className="text-lg font-bold">{v}</p></div>)}
          </div>
          {f.issues.length > 0 && <ul className="mt-4 space-y-2">{f.issues.map((i, k) => <li key={k} className={`flex gap-2 rounded-lg border p-3 text-sm ${i.severity === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</li>)}</ul>}
        </Card>)}

      <Card pad={false} title={`Examinations (${exams.length})`} actions={data?.period && (
        <div className="flex items-center gap-2"><div className="w-64"><Select value={add} onChange={setAdd} placeholder="Add a subject..." options={subjects.data.filter((s) => !inPeriod.has(s.id)).map((s) => [s.id, `${s.code} - ${s.name}`])} /></div>
          <button className="btn-secondary" disabled={!add || busy} onClick={() => act(() => api.post('/examinations', { subject_id: Number(add) }), 'Examination added').then((ok) => ok && setAdd(''))}><Plus className="h-4 w-4" /> Add</button></div>)}>
        <DataTable rows={exams} empty={<EmptyState icon={ClipboardList} title="No examinations" message="Enrol students in subjects, then click 'Generate from subjects'." action={<Link to="/subjects" className="btn-secondary">Go to subjects</Link>} />}
          columns={[
            { key: 'subject_code', header: 'Code', className: 'font-mono text-xs font-semibold' }, { key: 'subject_name', header: 'Subject', render: (r) => <span className="font-medium">{r.subject_name}</span> },
            { key: 'department_code', header: 'Dept', render: (r) => <Badge>{r.department_code}</Badge> }, { key: 'semester', header: 'Sem' },
            { key: 'student_count', header: 'Students', render: (r) => (r.student_count ? <Badge tone="indigo">{r.student_count}</Badge> : <Badge tone="amber">none</Badge>) },
            { key: 'duration_minutes', header: 'Duration', render: (r) => `${r.duration_minutes} min` },
            { key: 'a', header: '', className: 'text-right', render: (r) => (<div className="flex justify-end gap-1"><button className="btn-ghost !p-1.5" onClick={() => setEdit({ ...r })}><Pencil className="h-4 w-4" /></button><button className="btn-ghost !p-1.5 text-rose-600" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button></div>) },
          ]} />
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="sm" title={`Edit ${edit?.subject_code}`} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => act(() => api.put(`/examinations/${edit.id}`, { duration_minutes: edit.duration_minutes }), 'Examination updated').then((ok) => ok && setEdit(null))}>Save</button></>}>
        <Field label="Duration (minutes)" hint="Must fit inside a time slot, otherwise the feasibility check will flag it"><input className="input" type="number" min="15" step="15" value={edit?.duration_minutes || ''} onChange={(e) => setEdit({ ...edit, duration_minutes: e.target.value })} /></Field>
      </Modal>
      <ConfirmDialog open={!!del} busy={busy} onClose={() => setDel(null)} message={`Remove ${del?.subject_code} from this examination period?`} onConfirm={() => act(() => api.delete(`/examinations/${del.id}`), 'Examination removed').then(() => setDel(null))} />
    </>
  );
}
