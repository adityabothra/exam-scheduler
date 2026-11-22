import { useState } from 'react';
import { FileText, FileSpreadsheet, FileDown, Users, GraduationCap, DoorOpen, Building2, ShieldAlert, Cpu, CalendarDays } from 'lucide-react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { download, errMsg } from '../services/api';
import api from '../services/api';
import useFetch from '../hooks/useFetch';
import { Card, PageHeader, Spinner } from '../components/common/UI';

const REPORTS = [
  ['complete', 'Complete university timetable', 'Every examination with date, time, rooms and invigilators.', CalendarDays],
  ['student', 'Student-wise schedule', 'Each student\'s exams in order, with rooms.', GraduationCap],
  ['faculty', 'Faculty-wise invigilation schedule', 'Every invigilation duty and workload per faculty member.', Users],
  ['room', 'Room-wise schedule', 'Bookings per room with capacity and student count.', DoorOpen],
  ['department', 'Department-wise schedule', 'Examinations grouped by department.', Building2],
  ['conflicts', 'Conflict detection report', 'Result of independent hard-constraint validation.', ShieldAlert],
  ['optimization', 'AI optimization performance report', 'Parameters, iterations, acceptance statistics and cost improvement.', Cpu],
];
const FORMATS = [['pdf', 'PDF', FileText], ['xlsx', 'Excel', FileSpreadsheet], ['csv', 'CSV', FileDown]];

export default function Reports() {
  const cur = useFetch(() => api.get('/schedule/current').then((r) => r.data), [], { silent: true });
  const [busy, setBusy] = useState('');
  const go = async (type, format) => {
    setBusy(type + format);
    try { await download(`/reports/${type}`, { format, runId: cur.data?.runId || undefined }); toast.success('Report downloaded'); }
    catch (e) {
      let msg = errMsg(e);
      if (e?.response?.data instanceof Blob) { try { msg = JSON.parse(await e.response.data.text()).error; } catch { /* keep default */ } }
      toast.error(msg);
    } finally { setBusy(''); }
  };
  const run = cur.data?.run;

  return (
    <>
      <PageHeader title="Reports & Export" subtitle="Reports are generated from the current database records and include the university name, session, academic year and generation date."
        actions={run ? <span className="text-sm text-slate-500">Using run <b>#{run.id}</b> {run.is_published ? '(published)' : '(draft)'}</span> : <Link to="/optimizer" className="btn-secondary">No timetable yet - run the optimizer</Link>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(([type, title, desc, Icon]) => (
          <Card key={type}>
            <div className="flex items-start gap-3"><div className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><Icon className="h-5 w-5" /></div><div><p className="font-semibold text-ink">{title}</p><p className="mt-0.5 text-sm text-slate-500">{desc}</p></div></div>
            <div className="mt-4 flex gap-2">{FORMATS.map(([f, l, FI]) => (
              <button key={f} className="btn-secondary flex-1" disabled={!!busy || !run} onClick={() => go(type, f)}>{busy === type + f ? <Spinner className="!h-4 !w-4" /> : <FI className="h-4 w-4" />}{l}</button>))}</div>
          </Card>))}
      </div>
    </>
  );
}
