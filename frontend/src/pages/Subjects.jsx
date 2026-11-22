import { useState } from 'react';
import { Plus, Pencil, Trash2, Users, BookOpen, Building2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../services/api';
import * as svc from '../services/subjectService';
import useFetch, { useDebounced } from '../hooks/useFetch';
import useLookups from '../hooks/useLookups';
import { useCrud } from '../components/common/CrudHelpers';
import { Badge, Card, CheckList, ConfirmDialog, DataTable, EmptyState, Field, Modal, PageHeader, SearchInput, Select, Spinner, Tabs } from '../components/common/UI';

const blank = { code: '', name: '', department_id: '', course_id: '', semester: 1, duration_minutes: 180, priority: 3, faculty_ids: [] };

function SubjectForm({ open, onClose, item, lookups, faculty, onSave, busy }) {
  const [f, setF] = useState(blank);
  const [seen, setSeen] = useState(null);
  if (open && seen !== (item?.id ?? 'new')) { setSeen(item?.id ?? 'new'); setF(item ? { ...item, course_id: item.course_id || '', faculty_ids: item.faculty_ids || [] } : { ...blank, department_id: lookups.departments[0]?.id || '' }); }
  if (!open && seen !== null) setSeen(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit subject' : 'Add subject'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => onSave({ ...f, course_id: f.course_id || null })}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject code"><input className="input" value={f.code} onChange={set('code')} placeholder="CS301" /></Field>
        <Field label="Subject name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Department"><Select value={f.department_id} onChange={(v) => setF({ ...f, department_id: v, course_id: '' })} options={lookups.departments.map((d) => [d.id, d.name])} placeholder="Select..." /></Field>
        <Field label="Course"><Select value={f.course_id} onChange={(v) => setF({ ...f, course_id: v })} options={lookups.courses.filter((c) => String(c.department_id) === String(f.department_id)).map((c) => [c.id, c.name])} placeholder="None" /></Field>
        <Field label="Semester"><input className="input" type="number" min="1" max="12" value={f.semester} onChange={set('semester')} /></Field>
        <Field label="Examination duration (minutes)" hint="Must fit inside a time slot"><input className="input" type="number" min="15" step="15" value={f.duration_minutes} onChange={set('duration_minutes')} /></Field>
        <Field label="Examination priority (1-5)" hint="Used as a scheduling tie-breaker"><input className="input" type="number" min="1" max="5" value={f.priority} onChange={set('priority')} /></Field>
      </div>
      <div className="mt-5"><span className="label">Eligible invigilators ({f.faculty_ids.length || 'any'})</span>
        <CheckList height="max-h-48" items={faculty} selected={f.faculty_ids} onChange={(ids) => setF({ ...f, faculty_ids: ids })} getLabel={(x) => x.name} getSub={(x) => x.department_code} />
        <p className="mt-1 text-xs text-slate-400">Leave empty to allow every faculty member.</p></div>
    </Modal>
  );
}

function Enrollment({ id, onClose, onSaved }) {
  const { data } = useFetch(async () => {
    const [subject, students] = await Promise.all([svc.get(id), api.get('/students').then((r) => r.data)]);
    return { subject, students };
  }, [id]);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  if (data && sel === null) setSel(data.subject.student_ids);
  const shown = (data?.students || []).filter((s) => !q || `${s.student_code} ${s.name}`.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    setBusy(true);
    try { await api.put(`/subjects/${id}/enrollments`, { student_ids: sel }); toast.success('Enrolment saved'); onSaved(); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={data ? `Enrol students - ${data.subject.code} ${data.subject.name}` : 'Enrolment'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || sel === null} onClick={save}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Save enrolment</button></>}>
      {!data || sel === null ? <Spinner className="mx-auto" /> : (
        <div className="space-y-3">
          <div className="flex items-center gap-3"><SearchInput className="flex-1" value={q} onChange={setQ} placeholder="Filter students..." />
            <button className="btn-secondary" onClick={() => setSel([...new Set([...sel, ...shown.map((s) => s.id)])])}>Select shown</button>
            <button className="btn-secondary" onClick={() => setSel(sel.filter((i) => !shown.some((s) => s.id === i)))}>Clear shown</button></div>
          <p className="text-sm text-slate-500"><b>{sel.length}</b> student(s) enrolled</p>
          <CheckList height="max-h-80" items={shown} selected={sel} onChange={setSel} getLabel={(s) => `${s.student_code} - ${s.name}`} getSub={(s) => `${s.department_code} Sem ${s.semester}`} />
        </div>
      )}
    </Modal>
  );
}

export default function Subjects() {
  const lookups = useLookups();
  const faculty = useFetch(() => api.get('/faculty').then((r) => r.data), [], { silent: true, initial: [] });
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState({ department_id: '', semester: '' });
  const dq = useDebounced(q);
  const { data: rows, loading, reload } = useFetch(() => svc.list({ search: dq || undefined, department_id: flt.department_id || undefined, semester: flt.semester || undefined }), [dq, flt]);
  const crud = useCrud({ service: svc, reload: async () => { await reload(); lookups.reload(); }, noun: 'Subject' });
  const [edit, setEdit] = useState(null);
  const [enrol, setEnrol] = useState(null);
  const [tab, setTab] = useState('subjects');
  const openEdit = async (r) => { try { setEdit(r ? await svc.get(r.id) : 'new'); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <>
      <PageHeader title="Subjects & Courses" subtitle="Each subject with enrolled students becomes an examination event to schedule." actions={<button className="btn-primary" onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> Add subject</button>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[['subjects', 'Subjects', BookOpen], ['departments', 'Departments & courses', Building2]]} /></div>
      {tab === 'departments' ? <DeptCourses lookups={lookups} /> : (
        <Card pad={false}>
          <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search name or code..." />
            <Select value={flt.department_id} onChange={(v) => setFlt({ ...flt, department_id: v })} options={lookups.departments.map((d) => [d.id, d.name])} placeholder="All departments" />
            <Select value={flt.semester} onChange={(v) => setFlt({ ...flt, semester: v })} options={Array.from({ length: 8 }, (_, i) => [i + 1, `Semester ${i + 1}`])} placeholder="All semesters" />
          </div>
          <DataTable loading={loading} rows={rows} empty={<EmptyState icon={BookOpen} title="No subjects found" message="Add subjects, then enrol students in them." />}
            columns={[
              { key: 'code', header: 'Code', className: 'font-mono text-xs font-semibold' }, { key: 'name', header: 'Subject', render: (r) => <span className="font-medium">{r.name}</span> },
              { key: 'department_code', header: 'Dept', render: (r) => <Badge>{r.department_code}</Badge> }, { key: 'semester', header: 'Sem' },
              { key: 'duration_minutes', header: 'Duration', render: (r) => `${r.duration_minutes} min` }, { key: 'priority', header: 'Priority' },
              { key: 'enrolled_count', header: 'Students', render: (r) => <Badge tone="indigo">{r.enrolled_count}</Badge> },
              { key: 'e', header: 'Invigilators', render: (r) => (r.eligible_faculty_count ? r.eligible_faculty_count : <span className="text-slate-400">any</span>) },
              { key: 'a', header: '', className: 'text-right', render: (r) => (
                <div className="flex justify-end gap-1">
                  <button className="btn-ghost !p-1.5" title="Manage enrolment" onClick={() => setEnrol(r.id)}><Users className="h-4 w-4" /></button>
                  <button className="btn-ghost !p-1.5" title="Edit" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-ghost !p-1.5 text-rose-600" title="Delete" onClick={() => crud.setToDelete(r)}><Trash2 className="h-4 w-4" /></button>
                </div>) },
            ]} />
        </Card>
      )}
      <SubjectForm open={!!edit} item={edit === 'new' ? null : edit} lookups={lookups} faculty={faculty.data} onClose={() => setEdit(null)} busy={crud.busy} onSave={async (f) => { if (await crud.save(edit?.id, f)) setEdit(null); }} />
      {enrol && <Enrollment id={enrol} onClose={() => setEnrol(null)} onSaved={reload} />}
      <ConfirmDialog open={!!crud.toDelete} busy={crud.busy} onClose={() => crud.setToDelete(null)} onConfirm={crud.confirmDelete} message={`Delete ${crud.toDelete?.code}? Enrolments are removed too.`} />
    </>
  );
}

function DeptCourses({ lookups }) {
  const [dept, setDept] = useState({ code: '', name: '' });
  const [course, setCourse] = useState({ department_id: '', code: '', name: '' });
  const [del, setDel] = useState(null);
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); lookups.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Departments">
        <div className="mb-4 flex gap-2"><input className="input w-28" placeholder="Code" value={dept.code} onChange={(e) => setDept({ ...dept, code: e.target.value })} /><input className="input flex-1" placeholder="Department name" value={dept.name} onChange={(e) => setDept({ ...dept, name: e.target.value })} />
          <button className="btn-primary" onClick={() => run(async () => { await api.post('/departments', dept); setDept({ code: '', name: '' }); }, 'Department added')}><Plus className="h-4 w-4" /></button></div>
        <DataTable rows={lookups.departments} columns={[{ key: 'code', header: 'Code', className: 'font-semibold' }, { key: 'name', header: 'Name' }, { key: 'n', header: 'Students/Faculty/Subjects', render: (r) => `${r.student_count}/${r.faculty_count}/${r.subject_count}` },
          { key: 'a', header: '', render: (r) => <button className="btn-ghost !p-1.5 text-rose-600" onClick={() => setDel({ kind: 'departments', ...r })}><Trash2 className="h-4 w-4" /></button> }]} />
      </Card>
      <Card title="Courses">
        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_6rem_1fr_auto]"><Select value={course.department_id} onChange={(v) => setCourse({ ...course, department_id: v })} options={lookups.departments.map((d) => [d.id, d.code])} placeholder="Dept" /><input className="input" placeholder="Code" value={course.code} onChange={(e) => setCourse({ ...course, code: e.target.value })} /><input className="input" placeholder="Course name" value={course.name} onChange={(e) => setCourse({ ...course, name: e.target.value })} />
          <button className="btn-primary" onClick={() => run(async () => { await api.post('/courses', course); setCourse({ ...course, code: '', name: '' }); }, 'Course added')}><Plus className="h-4 w-4" /></button></div>
        <DataTable rows={lookups.courses} columns={[{ key: 'code', header: 'Code', className: 'font-semibold' }, { key: 'name', header: 'Name' }, { key: 'department_code', header: 'Dept' }, { key: 'student_count', header: 'Students' },
          { key: 'a', header: '', render: (r) => <button className="btn-ghost !p-1.5 text-rose-600" onClick={() => setDel({ kind: 'courses', ...r })}><Trash2 className="h-4 w-4" /></button> }]} />
      </Card>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} message={`Delete ${del?.code}?`} onConfirm={async () => { await run(() => api.delete(`/${del.kind}/${del.id}`), 'Deleted'); setDel(null); }} />
    </div>
  );
}
