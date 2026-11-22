import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, CalendarCheck, DoorOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { errMsg } from '../services/api';
import * as svc from '../services/roomService';
import useFetch, { useDebounced } from '../hooks/useFetch';
import { useCrud } from '../components/common/CrudHelpers';
import { Badge, Card, ConfirmDialog, DataTable, EmptyState, Field, Modal, PageHeader, SearchInput, Select, Spinner } from '../components/common/UI';
import { ROOM_TYPES, fmtDate } from '../utils/format';

const blank = { room_code: '', name: '', building: '', floor: 0, capacity: 40, room_type: 'classroom', status: 'available' };
const typeLabel = Object.fromEntries(ROOM_TYPES);

function RoomForm({ open, onClose, item, onSave, busy }) {
  const [f, setF] = useState(blank);
  const [seen, setSeen] = useState(null);
  if (open && seen !== (item?.id ?? 'new')) { setSeen(item?.id ?? 'new'); setF(item || blank); }
  if (!open && seen !== null) setSeen(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit examination room' : 'Add examination room'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => onSave(f)}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room ID"><input className="input" value={f.room_code} onChange={set('room_code')} placeholder="A101" /></Field>
        <Field label="Room name"><input className="input" value={f.name} onChange={set('name')} placeholder="Room A101" /></Field>
        <Field label="Building"><input className="input" value={f.building} onChange={set('building')} /></Field>
        <Field label="Floor"><input className="input" type="number" value={f.floor} onChange={set('floor')} /></Field>
        <Field label="Capacity (seats)" hint="Students assigned can never exceed the combined capacity"><input className="input" type="number" min="1" value={f.capacity} onChange={set('capacity')} /></Field>
        <Field label="Room type"><Select value={f.room_type} onChange={(v) => setF({ ...f, room_type: v })} options={ROOM_TYPES} /></Field>
        <Field label="Availability status" hint="Unavailable rooms are never used by the optimizer"><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['available', 'Available'], ['unavailable', 'Unavailable']]} /></Field>
      </div>
      <p className="mt-4 text-xs text-slate-500">Date/slot availability is set under <Link className="font-medium text-brand-600 underline" to="/availability">Availability Management</Link>.</p>
    </Modal>
  );
}

function RoomDetail({ id, onClose }) {
  const { data, loading } = useFetch(() => svc.schedule(id), [id], { silent: true });
  return (
    <Modal open onClose={onClose} title={data ? `${data.room.name} - examination assignments` : 'Room'} size="lg">
      {loading || !data ? <div className="py-8 text-center"><Spinner className="mx-auto" /></div> : !data.run ? <p className="text-sm text-slate-400">No timetable generated yet.</p> : (
        <DataTable rowKey="schedule_id" empty={<p className="py-6 text-center text-sm text-slate-400">This room has no examinations in the current timetable.</p>} rows={data.bookings}
          columns={[{ key: 'd', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 't', header: 'Time', render: (r) => `${r.start_time}-${r.end_time}` }, { key: 's', header: 'Subject', render: (r) => `${r.subject_code} ${r.subject_name}` },
            { key: 'o', header: 'Occupancy', render: (r) => `${r.occupancy}/${r.capacity} (${r.occupancy_percent}%)` }, { key: 'x', header: 'Shared with', render: (r) => r.shared_with_rooms.join(', ') || '-' }]} />
      )}
    </Modal>
  );
}

export default function Rooms() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const dq = useDebounced(q);
  const { data: rows, loading, reload } = useFetch(() => svc.list({ search: dq || undefined, room_type: type || undefined }), [dq, type]);
  const crud = useCrud({ service: svc, reload, noun: 'Room' });
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const openEdit = async (r) => { try { setEdit(r ? await svc.get(r.id) : 'new'); } catch (e) { toast.error(errMsg(e)); } };
  const totalSeats = (rows || []).filter((r) => r.status === 'available').reduce((a, r) => a + r.capacity, 0);

  return (
    <>
      <PageHeader title="Examination Rooms" subtitle={`Rooms, capacities and utilization.${rows ? ` ${totalSeats} seats available in total.` : ''} An examination larger than one room is split across several rooms.`}
        actions={<><Link to="/availability" className="btn-secondary"><CalendarCheck className="h-4 w-4" /> Availability</Link><button className="btn-primary" onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> Add room</button></>} />
      <Card pad={false}>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search room or building..." />
          <Select value={type} onChange={setType} options={ROOM_TYPES} placeholder="All room types" />
        </div>
        <DataTable loading={loading} rows={rows} empty={<EmptyState icon={DoorOpen} title="No rooms found" message="Add the rooms available for examinations." />}
          columns={[
            { key: 'room_code', header: 'ID', className: 'font-mono text-xs' }, { key: 'name', header: 'Room', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'building', header: 'Building', render: (r) => `${r.building}, floor ${r.floor}` }, { key: 'capacity', header: 'Capacity', render: (r) => <b>{r.capacity}</b> },
            { key: 'room_type', header: 'Type', render: (r) => <Badge tone="violet">{typeLabel[r.room_type]}</Badge> },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'available' ? 'green' : 'red'}>{r.status}</Badge> },
            { key: 'u', header: 'Utilization', render: (r) => (
              <div className="w-32"><div className="flex justify-between text-xs text-slate-500"><span>{r.exam_count} exam(s)</span><span>{r.utilization}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${Math.min(100, r.utilization)}%` }} /></div></div>) },
            { key: 'a', header: '', className: 'text-right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button className="btn-ghost !p-1.5" title="Assignments" onClick={() => setView(r.id)}><Eye className="h-4 w-4" /></button>
                <button className="btn-ghost !p-1.5" title="Edit" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
                <button className="btn-ghost !p-1.5 text-rose-600" title="Delete" onClick={() => crud.setToDelete(r)}><Trash2 className="h-4 w-4" /></button>
              </div>) },
          ]} />
      </Card>
      <RoomForm open={!!edit} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} busy={crud.busy} onSave={async (f) => { if (await crud.save(edit?.id, f)) setEdit(null); }} />
      {view && <RoomDetail id={view} onClose={() => setView(null)} />}
      <ConfirmDialog open={!!crud.toDelete} busy={crud.busy} onClose={() => crud.setToDelete(null)} onConfirm={crud.confirmDelete} message={`Delete ${crud.toDelete?.name}? This fails if it is used in a saved timetable.`} />
    </>
  );
}
