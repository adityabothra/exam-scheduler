import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, CalendarCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { errMsg } from '../services/api';
import * as svc from '../services/facultyService';
import useFetch, { useDebounced } from '../hooks/useFetch';
import useLookups from '../hooks/useLookups';
import { useCrud } from '../components/common/CrudHelpers';
import { Badge, Card, ConfirmDialog, DataTable, EmptyState, Field, Modal, PageHeader, SearchInput, Select, Spinner } from '../components/common/UI';
import { fmtDate } from '../utils/format';

const blank = { faculty_code: '', name: '', email: '', department_id: '', designation: 'Assistant Professor', max_workload: 6 };
const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Lab Instructor'];

function FacultyForm({ open, onClose, item, departments, onSave, busy }) {
  const [f, setF] = useState(blank);
  const [seen, setSeen] = useState(null);
  if (open && seen !== (item?.id ?? 'new')) { setSeen(item?.id ?? 'new'); setF(item || { ...blank, department_id: departments[0]?.id || '' }); }
  if (!open && seen !== null) setSeen(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit faculty member' : 'Add faculty member'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => onSave(f)}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Faculty ID"><input className="input" value={f.faculty_code} onChange={set('faculty_code')} /></Field>
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Department"><Select value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} options={departments.map((d) => [d.id, d.name])} placeholder="Select..." /></Field>
        <Field label="Designation"><Select value={f.designation} onChange={(v) => setF({ ...f, designation: v })} options={DESIGNATIONS.map((d) => [d, d])} /></Field>
        <Field label="Max invigilation workload" hint="Maximum number of invigilation duties"><input className="input" type="number" min="1" value={f.max_workload} onChange={set('max_workload')} /></Field>
      </div>
      <p className="mt-4 text-xs text-slate-500">Available dates and time slots are configured under <Link className="font-medium text-brand-600 underline" to="/availability">Availability Management</Link>.</p>
    </Modal>
  );
}

function FacultyDetail({ id, onClose }) {
  const { data, loading } = useFetch(() => svc.schedule(id), [id], { silent: true });
  return (
    <Modal open onClose={onClose} title={data ? data.faculty.name : 'Faculty'} size="lg">
      {loading || !data ? <div className="py-8 text-center"><Spinner className="mx-auto" /></div> : (
        <div className="space-y-5">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {[['ID', data.faculty.faculty_code], ['Department', data.faculty.department_name], ['Designation', data.faculty.designation], ['Email', data.faculty.email]].map(([k, v]) => <div key={k}><p className="label !mb-0">{k}</p><p className="font-medium">{v}</p></div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-brand-50 p-3"><p className="text-xs text-slate-500">Invigilation duties</p><p className="text-xl font-bold text-brand-700">{data.total_duties} / {data.max_workload}</p></div>
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-slate-500">Total hours</p><p className="text-xl font-bold text-emerald-700">{data.total_hours} h</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-slate-500">Workload used</p><p className="text-xl font-bold text-amber-700">{data.workload_percent}%</p></div>
          </div>
          {!data.run ? <p className="text-sm text-slate-400">No timetable generated yet.</p> : (
            <DataTable rowKey="schedule_id" empty={<p className="py-6 text-center text-sm text-slate-400">No invigilation duties assigned.</p>} rows={data.duties.map((d, i) => ({ ...d, schedule_id: `${d.schedule_id}-${i}` }))}
              columns={[{ key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 't', header: 'Time', render: (r) => `${r.start_time}-${r.end_time}` }, { key: 's', header: 'Subject', render: (r) => `${r.subject_code} ${r.subject_name}` }, { key: 'r', header: 'Room', render: (r) => r.duty_room?.name || '-' }]} />
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Faculty() {
  const { departments } = useLookups();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const dq = useDebounced(q);
  const { data: rows, loading, reload } = useFetch(() => svc.list({ search: dq || undefined, department_id: dept || undefined }), [dq, dept]);
  const crud = useCrud({ service: svc, reload, noun: 'Faculty member' });
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const openEdit = async (r) => { try { setEdit(r ? await svc.get(r.id) : 'new'); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <>
      <PageHeader title="Faculty Management" subtitle="Invigilators, their workload limits and availability. A faculty member is never assigned to two simultaneous examinations."
        actions={<><Link to="/availability" className="btn-secondary"><CalendarCheck className="h-4 w-4" /> Availability</Link><button className="btn-primary" onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> Add faculty</button></>} />
      <Card pad={false}>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, email or designation..." />
          <Select value={dept} onChange={setDept} options={departments.map((d) => [d.id, d.name])} placeholder="All departments" />
        </div>
        <DataTable loading={loading} rows={rows} empty={<EmptyState icon={Users} title="No faculty found" message="Add faculty members to staff the invigilation duties." />}
          columns={[
            { key: 'faculty_code', header: 'ID', className: 'font-mono text-xs' }, { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'department_code', header: 'Dept', render: (r) => <Badge>{r.department_code}</Badge> }, { key: 'designation', header: 'Designation' },
            { key: 'max_workload', header: 'Max duties' }, { key: 'u', header: 'Blocked slots', render: (r) => (r.unavailable_slot_count ? <Badge tone="amber">{r.unavailable_slot_count}</Badge> : <span className="text-slate-400">none</span>) },
            { key: 'a', header: '', className: 'text-right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button className="btn-ghost !p-1.5" title="View schedule" onClick={() => setView(r.id)}><Eye className="h-4 w-4" /></button>
                <button className="btn-ghost !p-1.5" title="Edit" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
                <button className="btn-ghost !p-1.5 text-rose-600" title="Delete" onClick={() => crud.setToDelete(r)}><Trash2 className="h-4 w-4" /></button>
              </div>) },
          ]} />
      </Card>
      <FacultyForm open={!!edit} item={edit === 'new' ? null : edit} departments={departments} onClose={() => setEdit(null)} busy={crud.busy} onSave={async (f) => { if (await crud.save(edit?.id, f)) setEdit(null); }} />
      {view && <FacultyDetail id={view} onClose={() => setView(null)} />}
      <ConfirmDialog open={!!crud.toDelete} busy={crud.busy} onClose={() => crud.setToDelete(null)} onConfirm={crud.confirmDelete} message={`Delete ${crud.toDelete?.name}? This fails if they are assigned to a saved timetable.`} />
    </>
  );
}
