import { useState } from 'react';
import { Plus, Pencil, Trash2, CalendarX, CalendarPlus, Star, Clock } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import usePeriod from '../hooks/usePeriod';
import { Badge, Card, ConfirmDialog, EmptyState, Field, Modal, PageHeader, PageLoader, Select, Spinner } from '../components/common/UI';
import { fmtDate, hm } from '../utils/format';

const eachDate = (a, b) => { const out = []; for (let d = new Date(a + 'T00:00:00Z'); d <= new Date(b + 'T00:00:00Z'); d = new Date(d.getTime() + 864e5)) out.push(d.toISOString().slice(0, 10)); return out; };

export default function TimeSlots() {
  const { periods, period, setPeriod, reload: reloadPeriods, loading: lp } = usePeriod();
  const { data: slots, loading, reload } = useFetch(() => (period ? api.get('/slots', { params: { period_id: period.id } }).then((r) => r.data) : []), [period?.id], { initial: [] });
  const [pModal, setPModal] = useState(null);
  const [sModal, setSModal] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => { reload(); reloadPeriods(); };
  const act = async (fn, msg) => { setBusy(true); try { await fn(); if (msg) toast.success(msg); refresh(); return true; } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); } };

  const byDate = slots.reduce((m, s) => { (m[s.slot_date] ||= []).push(s); return m; }, {});
  if (lp) return <PageLoader />;

  return (
    <>
      <PageHeader title="Examination Dates & Time Slots" subtitle="Define the examination period, its dates and the slots exams can occupy. Holidays and disabled slots are never used."
        actions={<><button className="btn-secondary" onClick={() => setPModal({})}><Plus className="h-4 w-4" /> New period</button>
          {period && <><button className="btn-secondary" onClick={() => setBulk(true)}><CalendarPlus className="h-4 w-4" /> Add dates & slots</button><button className="btn-primary" onClick={() => setSModal({ period_id: period.id, slot_date: period.start_date, label: 'Morning', start_time: '09:00', end_time: '12:00', is_holiday: false, is_available: true })}><Plus className="h-4 w-4" /> Add slot</button></>}</>} />
      {!period ? <Card><EmptyState icon={Clock} title="No examination period yet" message="Create a period (e.g. 'Winter 2026 End-Semester') to start adding dates and slots." action={<button className="btn-primary" onClick={() => setPModal({})}>Create period</button>} /></Card> : (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-60"><Select value={period.id} onChange={(v) => setPeriod(Number(v))} options={periods.map((p) => [p.id, `${p.name}${p.is_active ? ' (active)' : ''}`])} /></div>
              <Badge tone="indigo">{period.session_name}</Badge><Badge>{period.academic_year}</Badge>
              <span className="text-sm text-slate-500">{fmtDate(period.start_date)} - {fmtDate(period.end_date)}</span>
              <span className="text-sm text-slate-500">{period.usable_slot_count} usable / {period.slot_count} slots</span>
              <div className="ml-auto flex gap-2">
                {!period.is_active && <button className="btn-secondary" onClick={() => act(() => api.post(`/periods/${period.id}/activate`), 'Period activated')}><Star className="h-4 w-4" /> Make active</button>}
                <button className="btn-secondary" onClick={() => setPModal(period)}><Pencil className="h-4 w-4" /> Edit</button>
                <button className="btn-secondary text-rose-600" onClick={() => setDel({ kind: 'period', ...period })}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </Card>
          {loading && !slots.length ? <PageLoader /> : !slots.length ? <Card><EmptyState icon={Clock} title="No slots in this period" message="Use 'Add dates & slots' to create morning/afternoon slots for several dates at once." /></Card> : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(byDate).map(([date, list]) => {
                const holiday = list.every((s) => s.is_holiday);
                return (
                  <Card key={date} className={holiday ? 'bg-slate-50' : ''} title={fmtDate(date)} actions={
                    <button className={`btn-ghost !px-2 !py-1 text-xs ${holiday ? 'text-emerald-700' : 'text-amber-700'}`} onClick={() => act(() => api.post('/slots/holiday', { period_id: period.id, date, is_holiday: !holiday }), holiday ? 'Holiday removed' : 'Marked as holiday')}><CalendarX className="h-3.5 w-3.5" />{holiday ? 'Unmark holiday' : 'Mark holiday'}</button>}>
                    {holiday && <Badge tone="amber" className="mb-2">Holiday</Badge>}
                    <ul className="space-y-2">
                      {list.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <div className="flex-1"><p className="font-medium">{s.label}</p><p className="text-xs text-slate-500">{hm(s.start_time)} - {hm(s.end_time)}</p></div>
                          {!s.is_available && <Badge tone="red">disabled</Badge>}
                          {s.schedule_refs > 0 && <Badge tone="indigo">in use</Badge>}
                          <button className="btn-ghost !p-1.5" onClick={() => setSModal({ ...s, is_holiday: !!s.is_holiday, is_available: !!s.is_available })}><Pencil className="h-3.5 w-3.5" /></button>
                          <button className="btn-ghost !p-1.5 text-rose-600" onClick={() => setDel({ kind: 'slot', id: s.id, name: `${s.label} on ${date}` })}><Trash2 className="h-3.5 w-3.5" /></button>
                        </li>))}
                    </ul>
                  </Card>);
              })}
            </div>)}
        </>)}
      <PeriodModal data={pModal} onClose={() => setPModal(null)} busy={busy} onSave={(f) => act(() => (f.id ? api.put(`/periods/${f.id}`, f) : api.post('/periods', f)), 'Period saved').then((ok) => ok && setPModal(null))} />
      <SlotModal data={sModal} onClose={() => setSModal(null)} busy={busy} onSave={(f) => act(() => (f.id ? api.put(`/slots/${f.id}`, f) : api.post('/slots', f)), 'Slot saved').then((ok) => ok && setSModal(null))} />
      {bulk && <BulkModal period={period} onClose={() => setBulk(false)} busy={busy} onSave={(b) => act(async () => { const r = await api.post('/slots/bulk', b); toast.info(`${r.data.created} slot(s) created, ${r.data.skipped_existing} already existed`); }).then((ok) => ok && setBulk(false))} />}
      <ConfirmDialog open={!!del} busy={busy} onClose={() => setDel(null)} message={`Delete ${del?.kind} "${del?.name}"? ${del?.kind === 'period' ? 'All its slots, examinations and timetable runs are removed.' : 'This fails if a saved timetable uses it.'}`}
        onConfirm={() => act(() => api.delete(del.kind === 'period' ? `/periods/${del.id}` : `/slots/${del.id}`), 'Deleted').then(() => setDel(null))} />
    </>
  );
}

function PeriodModal({ data, onClose, onSave, busy }) {
  const [f, setF] = useState({});
  const [seen, setSeen] = useState(null);
  if (data && seen !== (data.id ?? 'new')) { setSeen(data.id ?? 'new'); setF(data.id ? { ...data } : { name: '', session_name: '', academic_year: '2026-2027', start_date: '', end_date: '', is_active: false }); }
  if (!data && seen !== null) setSeen(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={!!data} onClose={onClose} title={data?.id ? 'Edit examination period' : 'New examination period'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => onSave(f)}>Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Period name"><input className="input" value={f.name || ''} onChange={set('name')} /></Field>
        <Field label="Examination session"><input className="input" value={f.session_name || ''} onChange={set('session_name')} placeholder="Winter 2026 End-Semester" /></Field>
        <Field label="Academic year"><input className="input" value={f.academic_year || ''} onChange={set('academic_year')} /></Field>
        <span />
        <Field label="Start date"><input className="input" type="date" value={String(f.start_date || '').slice(0, 10)} onChange={set('start_date')} /></Field>
        <Field label="End date"><input className="input" type="date" value={String(f.end_date || '').slice(0, 10)} onChange={set('end_date')} /></Field>
      </div>
    </Modal>
  );
}

function SlotModal({ data, onClose, onSave, busy }) {
  const [f, setF] = useState({});
  const [seen, setSeen] = useState(null);
  if (data && seen !== (data.id ?? 'new')) { setSeen(data.id ?? 'new'); setF({ ...data, slot_date: String(data.slot_date).slice(0, 10), start_time: hm(data.start_time), end_time: hm(data.end_time) }); }
  if (!data && seen !== null) setSeen(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={!!data} onClose={onClose} title={data?.id ? 'Edit slot' : 'Add slot'} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => onSave(f)}>Save</button></>}>
      <div className="grid gap-4">
        <Field label="Date"><input className="input" type="date" value={f.slot_date || ''} onChange={set('slot_date')} /></Field>
        <Field label="Label"><input className="input" value={f.label || ''} onChange={set('label')} placeholder="Morning" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Start"><input className="input" type="time" value={f.start_time || ''} onChange={set('start_time')} /></Field><Field label="End"><input className="input" type="time" value={f.end_time || ''} onChange={set('end_time')} /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.is_available} onChange={(e) => setF({ ...f, is_available: e.target.checked })} /> Slot available for examinations</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.is_holiday} onChange={(e) => setF({ ...f, is_holiday: e.target.checked })} /> Holiday</label>
      </div>
    </Modal>
  );
}

function BulkModal({ period, onClose, onSave, busy }) {
  const all = eachDate(String(period.start_date).slice(0, 10), String(period.end_date).slice(0, 10));
  const [dates, setDates] = useState([]);
  const [tpl, setTpl] = useState([{ label: 'Morning', start_time: '09:00', end_time: '12:00' }, { label: 'Afternoon', start_time: '13:00', end_time: '16:00' }]);
  const upd = (i, k, v) => setTpl(tpl.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  return (
    <Modal open onClose={onClose} title="Add dates & time slots" size="lg" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !dates.length || !tpl.length} onClick={() => onSave({ period_id: period.id, dates, templates: tpl, is_holiday: false })}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Create {dates.length * tpl.length} slot(s)</button></>}>
      <p className="label">Slots per day</p>
      <div className="space-y-2">{tpl.map((t, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2"><input className="input w-36" value={t.label} onChange={(e) => upd(i, 'label', e.target.value)} /><input className="input w-32" type="time" value={t.start_time} onChange={(e) => upd(i, 'start_time', e.target.value)} /><span>to</span><input className="input w-32" type="time" value={t.end_time} onChange={(e) => upd(i, 'end_time', e.target.value)} />
          <button className="btn-ghost !p-1.5 text-rose-600" onClick={() => setTpl(tpl.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></div>))}
        <button className="btn-secondary" onClick={() => setTpl([...tpl, { label: 'Evening', start_time: '17:00', end_time: '20:00' }])}><Plus className="h-4 w-4" /> Another slot</button></div>
      <div className="mb-2 mt-5 flex items-center justify-between"><p className="label !mb-0">Dates ({dates.length} selected)</p><div className="flex gap-2"><button className="btn-ghost !py-1 text-xs" onClick={() => setDates(all)}>All</button><button className="btn-ghost !py-1 text-xs" onClick={() => setDates(all.filter((d) => ![0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())))}>Weekdays</button><button className="btn-ghost !py-1 text-xs" onClick={() => setDates([])}>None</button></div></div>
      <div className="grid max-h-60 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">{all.map((d) => (
        <label key={d} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${dates.includes(d) ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}><input type="checkbox" checked={dates.includes(d)} onChange={() => setDates(dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d])} />{fmtDate(d)}</label>))}</div>
    </Modal>
  );
}
