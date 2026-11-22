import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, GraduationCap, Users, DoorOpen, Building2, Pencil, Search, ShieldCheck, ShieldAlert, Clock, Rocket } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import useLookups from '../hooks/useLookups';
import { Badge, Card, CheckList, DataTable, EmptyState, Modal, PageHeader, PageLoader, Select, Spinner, Tabs } from '../components/common/UI';
import { fmtDate, fmtShort } from '../utils/format';

const PALETTE = ['bg-indigo-50 border-indigo-300', 'bg-emerald-50 border-emerald-300', 'bg-amber-50 border-amber-300', 'bg-sky-50 border-sky-300', 'bg-rose-50 border-rose-300', 'bg-violet-50 border-violet-300', 'bg-teal-50 border-teal-300'];

function ExamCard({ e, roomId, onEdit }) {
  const color = PALETTE[e.department_id % PALETTE.length];
  const invs = roomId ? e.invigilators.filter((i) => i.room_id === roomId) : e.invigilators;
  return (
    <div className={`rounded-lg border p-2.5 text-xs shadow-sm ${color}`}>
      <div className="flex items-start justify-between gap-1"><p className="font-semibold text-ink">{e.subject_code}</p>{onEdit && <button className="text-slate-400 hover:text-brand-600" onClick={() => onEdit(e)} title="Edit assignment"><Pencil className="h-3 w-3" /></button>}</div>
      <p className="font-medium leading-tight text-slate-700">{e.subject_name}</p>
      <p className="mt-1 text-slate-500">{e.department_code} - Sem {e.semester} - {e.student_count} students</p>
      <p className="text-slate-500"><Clock className="mr-0.5 inline h-3 w-3" />{e.duration_minutes} min ({e.start_time}-{e.exam_end_time})</p>
      <p className="mt-1 text-slate-600"><b>Rooms:</b> {e.rooms.map((r) => r.name).join(', ')}</p>
      <p className="text-slate-600"><b>Invigilators:</b> {invs.map((i) => i.name).join(', ') || '-'}</p>
    </div>
  );
}

function EditModal({ exam, run, onClose, onSaved }) {
  const slots = useFetch(() => api.get('/slots', { params: { period_id: run.period_id } }).then((r) => r.data), [], { initial: [], silent: true });
  const rooms = useFetch(() => api.get('/rooms').then((r) => r.data), [], { initial: [], silent: true });
  const faculty = useFetch(() => api.get('/faculty').then((r) => r.data), [], { initial: [], silent: true });
  const [f, setF] = useState({ slot_id: exam.slot_id, room_ids: exam.rooms.map((r) => r.id), invigilator_ids: exam.invigilators.map((i) => i.faculty_id) });
  const [busy, setBusy] = useState(false);
  const seats = rooms.data.filter((r) => f.room_ids.includes(r.id)).reduce((a, r) => a + r.capacity, 0);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/schedule/${run.id}/exam/${exam.examination_id}`, f);
      toast[data.validation.valid ? 'success' : 'warning'](data.message);
      onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`Adjust ${exam.subject_code} - ${exam.subject_name}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Save & re-validate</button></>}>
      <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Manual changes are saved even if they break a constraint so you can see exactly what conflicts. Saving un-publishes the timetable and re-runs the independent validator.</p>
      <div className="space-y-4">
        <div><span className="label">Date & time slot</span><Select value={f.slot_id} onChange={(v) => setF({ ...f, slot_id: Number(v) })} options={slots.data.map((s) => [s.id, `${fmtDate(s.slot_date)} - ${s.label} ${String(s.start_time).slice(0, 5)}-${String(s.end_time).slice(0, 5)}${s.is_holiday ? ' (holiday)' : ''}`])} /></div>
        <div><span className="label">Rooms ({seats} seats for {exam.student_count} students)</span>
          <CheckList height="max-h-40" items={rooms.data} selected={f.room_ids} onChange={(ids) => setF({ ...f, room_ids: ids })} getLabel={(r) => r.name} getSub={(r) => `${r.capacity} seats`} />
          {seats < exam.student_count && <p className="mt-1 text-xs text-rose-600">Selected rooms are too small.</p>}</div>
        <div><span className="label">Invigilators ({f.invigilator_ids.length}, one per room required)</span>
          <CheckList height="max-h-48" items={faculty.data} selected={f.invigilator_ids} onChange={(ids) => setF({ ...f, invigilator_ids: ids })} getLabel={(x) => x.name} getSub={(x) => x.department_code} /></div>
      </div>
    </Modal>
  );
}

function CompleteView({ run, filters, onEdit }) {
  const q = useFetch(() => api.get('/schedule/complete', { params: { runId: run.id, ...filters } }).then((r) => r.data), [run.id, run.validation_status, JSON.stringify(filters)]);
  if (q.loading && !q.data) return <PageLoader />;
  const { rows = [], rooms = [] } = q.data || {};
  const shown = rows.filter((r) => r.exams.length || !filters.date);
  return (
    <Card pad={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead><tr><th className="th sticky left-0 z-10 min-w-36 border-b border-slate-200">Date / slot</th>{rooms.map((r) => <th key={r.id} className="th min-w-52 border-b border-l border-slate-200">{r.name}<span className="ml-1 font-normal normal-case text-slate-400">({r.capacity})</span></th>)}</tr></thead>
          <tbody>{shown.map((row) => (
            <tr key={row.slot_id} className={row.holiday ? 'bg-slate-50' : ''}>
              <td className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-3 align-top"><p className="font-semibold">{fmtShort(row.date)}</p><p className="text-xs text-slate-500">{row.label} {row.start_time}-{row.end_time}</p>{row.holiday && <Badge tone="amber">holiday</Badge>}</td>
              {rooms.map((r) => {
                const here = row.exams.filter((e) => e.rooms.some((x) => x.id === r.id));
                return <td key={r.id} className="space-y-2 border-b border-l border-slate-200 p-2 align-top">{here.map((e) => <ExamCard key={e.examination_id} e={e} roomId={r.id} onEdit={onEdit} />)}</td>;
              })}
            </tr>))}</tbody>
        </table>
      </div>
      {!shown.length && <EmptyState title="No examinations match" />}
    </Card>
  );
}

function StudentView({ run }) {
  const [code, setCode] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, error } = useFetch(() => (q ? api.get(`/schedule/student/${encodeURIComponent(q)}`, { params: { runId: run.id } }).then((r) => r.data) : null), [q, run.id], { silent: true });
  return (
    <div className="space-y-4">
      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setQ(code.trim()); }}><input className="input" placeholder="Student ID, e.g. S26001" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn-primary"><Search className="h-4 w-4" /> Search</button></form>
      {loading && <PageLoader />}
      {error && !loading && <p className="text-sm text-rose-600">{error}</p>}
      {data && (
        <Card title={`${data.student.student_code} - ${data.student.name}`} subtitle={`${data.student.department_name}, semester ${data.student.semester} - ${data.enrolled_subjects} enrolled subject(s), ${data.scheduled_count} scheduled`}>
          <div className="mb-3 flex flex-wrap gap-1.5">{data.student.subjects.map((s) => <Badge key={s.id} tone="indigo">{s.code}</Badge>)}</div>
          <DataTable rowKey="examination_id" rows={data.sequence} columns={[
            { key: 'sequence', header: 'Seq' }, { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 't', header: 'Time', render: (r) => `${r.start_time}-${r.exam_end_time}` },
            { key: 's', header: 'Subject', render: (r) => `${r.subject_code} ${r.subject_name}` }, { key: 'r', header: 'Room', render: (r) => r.rooms.map((x) => x.name).join(', ') },
            { key: 'g', header: 'Gap since previous', render: (r) => (r.gap_hours === null ? '-' : <Badge tone={r.gap_hours < 12 ? 'amber' : 'green'}>{r.gap_hours} h</Badge>) }]} />
        </Card>)}
    </div>
  );
}

function PersonRoomView({ kind, run }) {
  const list = useFetch(() => api.get(kind === 'faculty' ? '/faculty' : '/rooms').then((r) => r.data), [kind], { initial: [], silent: true });
  const [id, setId] = useState('');
  const sel = id || list.data[0]?.id;
  const { data, loading } = useFetch(() => (sel ? api.get(`/schedule/${kind}/${sel}`, { params: { runId: run.id } }).then((r) => r.data) : null), [kind, sel, run.id], { silent: true });
  const rows = kind === 'faculty' ? data?.duties : data?.bookings;
  return (
    <div className="space-y-4">
      <div className="max-w-sm"><Select value={sel} onChange={setId} options={list.data.map((x) => [x.id, x.name])} /></div>
      {loading && !data ? <PageLoader /> : data && (
        <Card title={kind === 'faculty' ? data.faculty.name : `${data.room.name} - capacity ${data.room.capacity}`}
          subtitle={kind === 'faculty' ? `${data.total_duties} duties (max ${data.max_workload}), ${data.total_hours} hours, ${data.workload_percent}% of workload` : `${data.booking_count} booking(s)`}>
          <DataTable rowKey="k" empty={<p className="py-6 text-center text-sm text-slate-400">No assignments.</p>} rows={(rows || []).map((r, i) => ({ ...r, k: i }))} columns={[
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 't', header: 'Time', render: (r) => `${r.start_time}-${r.exam_end_time}` }, { key: 's', header: 'Subject', render: (r) => `${r.subject_code} ${r.subject_name}` },
            kind === 'faculty' ? { key: 'r', header: 'Room', render: (r) => r.duty_room?.name || '-' } : { key: 'o', header: 'Occupancy', render: (r) => <span>{r.occupancy}/{r.capacity} <Badge tone={r.occupancy_percent > 90 ? 'amber' : 'green'}>{r.occupancy_percent}%</Badge></span> }]} />
        </Card>)}
    </div>
  );
}

export default function Timetable() {
  const runs = useFetch(() => api.get('/optimization/history').then((r) => r.data.filter((x) => x.status === 'completed')), [], { initial: [] });
  const cur = useFetch(() => api.get('/schedule/current').then((r) => r.data), [], { silent: true });
  const lookups = useLookups();
  const [runId, setRunId] = useState('');
  const [tab, setTab] = useState('complete');
  const [filters, setFilters] = useState({ department_id: '', semester: '', date: '' });
  const [edit, setEdit] = useState(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const id = runId ? Number(runId) : cur.data?.runId;
  const run = useMemo(() => runs.data.find((r) => r.id === id), [runs.data, id]);
  const dates = useFetch(() => (run ? api.get('/slots', { params: { period_id: run.period_id } }).then((r) => [...new Set(r.data.filter((s) => !s.is_holiday).map((s) => String(s.slot_date).slice(0, 10)))]) : []), [run?.period_id], { initial: [], silent: true });
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const refresh = () => { runs.reload(); cur.reload(); setTick((t) => t + 1); };

  const publish = async () => {
    setBusy(true);
    try { await api.post('/schedule/publish', null, { params: { runId: run.id } }); toast.success('Timetable published'); refresh(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (runs.loading && !runs.data.length) return <PageLoader />;
  if (!run) return <><PageHeader title="Examination Timetable" /><Card><EmptyState icon={CalendarDays} title="No timetable yet" message="Run the AI Optimizer to generate one." action={<Link to="/optimizer" className="btn-primary">Open AI Optimizer</Link>} /></Card></>;

  return (
    <>
      <PageHeader title="Examination Timetable" subtitle={`${run.period_name} - run #${run.id}`}
        actions={<>
          {runs.data.length > 1 && <div className="w-64"><Select value={id} onChange={setRunId} options={runs.data.map((r) => [r.id, `Run #${r.id} - ${r.name}${r.is_published ? ' (published)' : ''}`])} /></div>}
          <Badge tone={run.validation_status === 'valid' ? 'green' : run.validation_status === 'invalid' ? 'red' : 'amber'}>{run.validation_status === 'valid' ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}{run.validation_status}</Badge>
          {run.is_published ? <Badge tone="green">Published</Badge> : <button className="btn-primary" disabled={busy} onClick={publish}><Rocket className="h-4 w-4" /> Publish</button>}
          <Link to="/conflicts" className="btn-secondary">Validate</Link></>} />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[['complete', 'Complete timetable', CalendarDays], ['student', 'Student', GraduationCap], ['faculty', 'Faculty', Users], ['room', 'Room', DoorOpen], ['dept', 'Department-wise', Building2]]} /></div>

      {(tab === 'complete' || tab === 'dept') && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select value={filters.department_id} onChange={(v) => setFilters({ ...filters, department_id: v })} options={lookups.departments.map((d) => [d.id, d.name])} placeholder="All departments" />
          <Select value={filters.semester} onChange={(v) => setFilters({ ...filters, semester: v })} options={Array.from({ length: 8 }, (_, i) => [i + 1, `Semester ${i + 1}`])} placeholder="All semesters" />
          <Select value={filters.date} onChange={(v) => setFilters({ ...filters, date: v })} options={dates.data.map((d) => [d, fmtDate(d)])} placeholder="All dates" />
        </div>)}

      {tab === 'complete' && <CompleteView key={tick} run={run} filters={clean} onEdit={setEdit} />}
      {tab === 'student' && <StudentView run={run} />}
      {tab === 'faculty' && <PersonRoomView kind="faculty" run={run} />}
      {tab === 'room' && <PersonRoomView kind="room" run={run} />}
      {tab === 'dept' && <DeptView run={run} filters={clean} />}
      {edit && <EditModal exam={edit} run={run} onClose={() => setEdit(null)} onSaved={refresh} />}
    </>
  );
}

function DeptView({ run, filters }) {
  const { data, loading } = useFetch(() => api.get('/schedule/complete', { params: { runId: run.id, ...filters } }).then((r) => r.data), [run.id, JSON.stringify(filters)]);
  if (loading && !data) return <PageLoader />;
  const groups = (data?.exams || []).reduce((m, e) => { (m[e.department_name] ||= []).push(e); return m; }, {});
  if (!Object.keys(groups).length) return <Card><EmptyState title="No examinations match these filters" /></Card>;
  return (
    <div className="space-y-5">{Object.entries(groups).map(([name, list]) => (
      <Card key={name} title={name} subtitle={`${list.length} examination(s)`} pad={false}>
        <DataTable rowKey="examination_id" rows={list} columns={[
          { key: 'd', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 't', header: 'Time', render: (r) => `${r.start_time}-${r.exam_end_time}` }, { key: 'c', header: 'Code', className: 'font-mono text-xs font-semibold', render: (r) => r.subject_code },
          { key: 's', header: 'Subject', render: (r) => r.subject_name }, { key: 'sem', header: 'Sem', render: (r) => r.semester }, { key: 'n', header: 'Students', render: (r) => r.student_count },
          { key: 'r', header: 'Rooms', render: (r) => r.rooms.map((x) => x.name).join(', ') }, { key: 'i', header: 'Invigilators', render: (r) => r.invigilators.map((x) => x.name).join(', ') }]} />
      </Card>))}</div>
  );
}
