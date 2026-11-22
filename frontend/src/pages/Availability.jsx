import { useState } from 'react';
import { CalendarCheck, Save, CheckCheck, Ban } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import usePeriod from '../hooks/usePeriod';
import { Badge, Card, EmptyState, PageHeader, PageLoader, Select, Spinner, Tabs } from '../components/common/UI';
import { fmtShort, hm } from '../utils/format';

export default function Availability() {
  const [type, setType] = useState('faculty');
  const { periods, period, setPeriod, loading: lp } = usePeriod();
  const { data: ov, loading, reload } = useFetch(() => (period ? api.get(`/availability/${type}/overview`, { params: { period_id: period.id } }).then((r) => r.data) : null), [type, period?.id]);
  const [entityId, setEntityId] = useState('');
  const eid = entityId && ov?.entities.some((e) => String(e.id) === String(entityId)) ? entityId : ov?.entities[0]?.id;
  const { data: det, loading: ld, reload: reloadDet, setData } = useFetch(() => (eid && period ? api.get(`/availability/${type}/${eid}`, { params: { period_id: period.id } }).then((r) => r.data) : null), [type, eid, period?.id]);
  const [dirty, setDirty] = useState({});
  const [busy, setBusy] = useState(false);

  const slots = det?.slots || [];
  const val = (s) => (s.slot_id in dirty ? dirty[s.slot_id] : !!s.is_available);
  const toggle = (s) => setDirty({ ...dirty, [s.slot_id]: !val(s) });
  const setAll = (v, only) => { const d = { ...dirty }; slots.filter((s) => (only ? only(s) : true)).forEach((s) => { d[s.slot_id] = v; }); setDirty(d); };
  const changes = slots.filter((s) => s.slot_id in dirty && dirty[s.slot_id] !== !!s.is_available).map((s) => ({ slot_id: s.slot_id, is_available: dirty[s.slot_id] }));

  const save = async () => {
    setBusy(true);
    try { await api.put(`/availability/${type}/${eid}`, { period_id: period.id, slots: changes }); toast.success(`${changes.length} change(s) saved`); setDirty({}); await reloadDet(); reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const byDate = slots.reduce((m, s) => { (m[s.slot_date] ||= []).push(s); return m; }, {});
  const label = type === 'faculty' ? 'faculty member' : 'room';
  if (lp) return <PageLoader />;

  return (
    <>
      <PageHeader title="Availability Management" subtitle="Mark the dates and time slots each faculty member or room is NOT available. The optimizer treats these as hard constraints." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={type} onChange={(t) => { setType(t); setDirty({}); setEntityId(''); }} tabs={[['faculty', 'Faculty availability'], ['room', 'Room availability']]} />
        {periods.length > 1 && <div className="w-64"><Select value={period?.id} onChange={(v) => { setPeriod(Number(v)); setDirty({}); }} options={periods.map((p) => [p.id, p.name])} /></div>}
      </div>
      {!period ? <Card><EmptyState icon={CalendarCheck} title="No examination period" message="Create a period and slots first on the Time Slots page." /></Card> : loading && !ov ? <PageLoader /> : !ov?.slots.length ? <Card><EmptyState icon={CalendarCheck} title="No time slots" message="Add time slots for this period first." /></Card> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <Card title={`Edit ${label}`} subtitle="Click a slot to toggle it. Green = available, red = unavailable.">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="w-72"><Select value={eid} onChange={(v) => { setEntityId(v); setDirty({}); }} options={ov.entities.map((e) => [e.id, e.name])} /></div>
              <button className="btn-secondary" onClick={() => setAll(true)}><CheckCheck className="h-4 w-4" /> All available</button>
              <button className="btn-secondary" onClick={() => setAll(false)}><Ban className="h-4 w-4" /> All unavailable</button>
              <button className="btn-primary ml-auto" disabled={!changes.length || busy} onClick={save}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <Save className="h-4 w-4" />} Save {changes.length ? `(${changes.length})` : ''}</button>
            </div>
            {ld && !det ? <PageLoader /> : (
              <div className="space-y-3">{Object.entries(byDate).map(([date, list]) => (
                <div key={date} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="w-28 text-sm font-semibold">{fmtShort(date)}<span className="ml-1 text-xs font-normal text-slate-400">{new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span></div>
                  {list.map((s) => {
                    const on = val(s);
                    return (
                      <button key={s.slot_id} onClick={() => toggle(s)} disabled={!!s.is_holiday}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${s.is_holiday ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : on ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'} ${s.slot_id in dirty ? 'ring-2 ring-brand-500/40' : ''}`}>
                        <span className="block font-medium">{s.label}</span><span className="text-xs opacity-80">{hm(s.start_time)}-{hm(s.end_time)} {s.is_holiday ? '(holiday)' : on ? '- available' : '- unavailable'}</span>
                      </button>);
                  })}
                </div>))}</div>)}
          </Card>
          <Card title="Overview" subtitle={`Blocked slots per ${label}`} pad={false}>
            <ul className="divide-y divide-slate-100">{ov.entities.map((e) => { const n = (ov.unavailable[e.id] || []).length; return (
              <li key={e.id}><button onClick={() => { setEntityId(e.id); setDirty({}); }} className={`flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-slate-50 ${String(e.id) === String(eid) ? 'bg-brand-50' : ''}`}><span className="font-medium">{e.name}</span>{n ? <Badge tone="amber">{n} blocked</Badge> : <Badge tone="green">fully available</Badge>}</button></li>); })}</ul>
          </Card>
        </div>)}
    </>
  );
}
