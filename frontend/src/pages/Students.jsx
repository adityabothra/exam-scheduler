import { useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Upload, BookOpen, CalendarDays, GraduationCap } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../services/api';
import * as svc from '../services/studentService';
import useFetch, { useDebounced } from '../hooks/useFetch';
import useLookups from '../hooks/useLookups';
import { useCrud } from '../components/common/CrudHelpers';
import { Badge, Card, CheckList, ConfirmDialog, DataTable, EmptyState, Field, Modal, PageHeader, SearchInput, Select, Spinner } from '../components/common/UI';
import { fmtDate } from '../utils/format';

const blank = { student_code: '', name: '', email: '', department_id: '', course_id: '', semester: 1, academic_year: '2026-2027', subject_ids: [] };

function StudentForm({ open, onClose, student, lookups, onSave, busy }) {
  const [f, setF] = useState(blank);
  const [seen, setSeen] = useState(null);
  if (open && seen !== (student?.id ?? 'new')) { setSeen(student?.id ?? 'new'); setF(student ? { ...student, course_id: student.course_id || '', subject_ids: student.subject_ids || [] } : { ...blank, department_id: lookups.departments[0]?.id || '' }); }
  if (!open && seen !== null) setSeen(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const courses = lookups.courses.filter((c) => String(c.department_id) === String(f.department_id));
  return (
    <Modal open={open} onClose={onClose} title={student ? 'Edit student' : 'Add student'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => onSave({ ...f, course_id: f.course_id || null })}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student ID"><input className="input" value={f.student_code} onChange={set('student_code')} /></Field>
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Academic year"><input className="input" value={f.academic_year} onChange={set('academic_year')} placeholder="2026-2027" /></Field>
        <Field label="Department"><Select value={f.department_id} onChange={(v) => setF({ ...f, department_id: v, course_id: '' })} options={lookups.departments.map((d) => [d.id, `${d.code} - ${d.name}`])} placeholder="Select..." /></Field>
        <Field label="Course"><Select value={f.course_id} onChange={(v) => setF({ ...f, course_id: v })} options={courses.map((c) => [c.id, c.name])} placeholder="None" /></Field>
        <Field label="Semester"><input className="input" type="number" min="1" max="12" value={f.semester} onChange={set('semester')} /></Field>
      </div>
      <div className="mt-5"><span className="label">Enrolled subjects ({f.subject_ids.length})</span>
        <CheckList items={lookups.subjects} selected={f.subject_ids} onChange={(ids) => setF({ ...f, subject_ids: ids })} getLabel={(s) => `${s.code} - ${s.name}`} getSub={(s) => `Sem ${s.semester}`} /></div>
    </Modal>
  );
}

function StudentDetail({ id, onClose }) {
  const { data, loading } = useFetch(async () => {
    const [student, tt] = await Promise.all([svc.get(id), api.get(`/schedule/student/${id}`).then((r) => r.data).catch(() => null)]);
    return { student, tt };
  }, [id], { silent: true });
  const s = data?.student, tt = data?.tt;
  return (
    <Modal open onClose={onClose} title={s ? `${s.student_code} - ${s.name}` : 'Student'} size="lg">
      {loading || !s ? <div className="py-8 text-center"><Spinner className="mx-auto" /></div> : (
        <div className="space-y-5">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            {[['Email', s.email], ['Department', s.department_name], ['Course', s.course_name || '-'], ['Semester', s.semester], ['Academic year', s.academic_year], ['Enrolled subjects', s.subjects.length]].map(([k, v]) => <div key={k}><p className="label !mb-0">{k}</p><p className="font-medium">{v}</p></div>)}
          </div>
          <div><p className="label flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> Enrolled subjects</p>
            <div className="flex flex-wrap gap-2">{s.subjects.length ? s.subjects.map((x) => <Badge key={x.id} tone="indigo">{x.code} - {x.name}</Badge>) : <span className="text-sm text-slate-400">Not enrolled in any subject</span>}</div></div>
          <div><p className="label flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Examination timetable</p>
            {!tt?.run ? <p className="text-sm text-slate-400">No timetable generated yet.</p> : (
              <DataTable rowKey="examination_id" columns={[
                { key: 'sequence', header: '#' }, { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'time', header: 'Time', render: (r) => `${r.start_time}-${r.end_time}` },
                { key: 'subject', header: 'Subject', render: (r) => `${r.subject_code} ${r.subject_name}` }, { key: 'rooms', header: 'Room', render: (r) => r.rooms.map((x) => x.name).join(', ') },
                { key: 'gap', header: 'Gap', render: (r) => (r.gap_hours === null ? '-' : `${r.gap_hours} h`) },
              ]} rows={tt.sequence} />
            )}</div>
        </div>
      )}
    </Modal>
  );
}

export default function Students() {
  const lookups = useLookups();
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState({ department_id: '', semester: '', course_id: '' });
  const dq = useDebounced(q);
  const { data: rows, loading, reload } = useFetch(() => svc.list({ search: dq || undefined, department_id: flt.department_id || undefined, semester: flt.semester || undefined, course_id: flt.course_id || undefined }), [dq, flt]);
  const crud = useCrud({ service: svc, reload, noun: 'Student' });
  const [edit, setEdit] = useState(null); // null | 'new' | student
  const [view, setView] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const openEdit = async (r) => { try { setEdit(r ? await svc.get(r.id) : 'new'); } catch (e) { toast.error(errMsg(e)); } };
  const onSave = async (f) => { if (await crud.save(edit?.id, f)) setEdit(null); };

  const doImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/students/import', fd);
      toast[data.created ? 'success' : 'warning'](`Imported ${data.created} of ${data.total} rows (${data.skipped} duplicates skipped)`);
      data.errors.slice(0, 4).forEach((x) => toast.warning(`Row ${x.row}: ${x.message}`, { autoClose: 8000 }));
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setImporting(false); fileRef.current.value = ''; }
  };

  return (
    <>
      <PageHeader title="Student Management" subtitle="Students and their subject enrolments. Enrolments drive every student-clash constraint."
        actions={<>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => doImport(e.target.files[0])} />
          <button className="btn-secondary" disabled={importing} onClick={() => fileRef.current.click()}>{importing ? <Spinner className="!h-4 !w-4" /> : <Upload className="h-4 w-4" />} Import CSV</button>
          <button className="btn-primary" onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> Add student</button>
        </>} />
      <Card pad={false}>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID or email..." />
          <Select value={flt.department_id} onChange={(v) => setFlt({ ...flt, department_id: v, course_id: '' })} options={lookups.departments.map((d) => [d.id, d.name])} placeholder="All departments" />
          <Select value={flt.course_id} onChange={(v) => setFlt({ ...flt, course_id: v })} options={lookups.courses.filter((c) => !flt.department_id || String(c.department_id) === flt.department_id).map((c) => [c.id, c.name])} placeholder="All courses" />
          <Select value={flt.semester} onChange={(v) => setFlt({ ...flt, semester: v })} options={Array.from({ length: 8 }, (_, i) => [i + 1, `Semester ${i + 1}`])} placeholder="All semesters" />
        </div>
        <DataTable loading={loading} rows={rows} empty={<EmptyState icon={GraduationCap} title="No students found" message="Add a student, import a CSV, or load the demo dataset from the dashboard." />}
          columns={[
            { key: 'student_code', header: 'ID', className: 'font-mono text-xs' }, { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'department_code', header: 'Dept', render: (r) => <Badge>{r.department_code}</Badge> }, { key: 'course_name', header: 'Course', render: (r) => r.course_name || '-' },
            { key: 'semester', header: 'Sem' }, { key: 'enrolled_count', header: 'Subjects', render: (r) => <Badge tone="indigo">{r.enrolled_count}</Badge> },
            { key: 'a', header: '', className: 'text-right', render: (r) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="btn-ghost !p-1.5" title="View" onClick={() => setView(r.id)}><Eye className="h-4 w-4" /></button>
                <button className="btn-ghost !p-1.5" title="Edit" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
                <button className="btn-ghost !p-1.5 text-rose-600" title="Delete" onClick={() => crud.setToDelete(r)}><Trash2 className="h-4 w-4" /></button>
              </div>) },
          ]} />
        {rows && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">{rows.length} student(s). CSV columns: student_code, name, email, department_code, course_code, semester, academic_year, subjects (codes separated by ;)</p>}
      </Card>
      <StudentForm open={!!edit} student={edit === 'new' ? null : edit} lookups={lookups} onClose={() => setEdit(null)} onSave={onSave} busy={crud.busy} />
      {view && <StudentDetail id={view} onClose={() => setView(null)} />}
      <ConfirmDialog open={!!crud.toDelete} busy={crud.busy} onClose={() => crud.setToDelete(null)} onConfirm={crud.confirmDelete} message={`Delete ${crud.toDelete?.name}? Their enrolments will be removed too.`} />
    </>
  );
}
