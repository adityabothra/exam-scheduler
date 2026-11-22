import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GraduationCap, Users, BookOpen, DoorOpen, ClipboardCheck, CalendarClock, ShieldAlert, Gauge, UserCheck, Target, Plus, Clock, Cpu, CalendarDays, Database, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import { useState } from 'react';
import api, { errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Card, EmptyState, PageHeader, PageLoader, StatCard, Spinner, Badge } from '../components/common/UI';
import { CONFLICT_COLORS, CONFLICT_LABELS, fmtShort, num } from '../utils/format';

const C = { indigo: '#4f46e5', slate: '#cbd5e1', green: '#10b981', amber: '#f59e0b', rose: '#e11d48', sky: '#0ea5e9' };
const tip = { contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 } };

function Chart({ title, subtitle, children, empty }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="h-64">{empty ? <div className="flex h-full items-center justify-center text-sm text-slate-400">{empty}</div> : <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>}</div>
    </Card>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { data, loading, reload } = useFetch(() => api.get('/dashboard').then((r) => r.data));
  const [busy, setBusy] = useState(false);

  const loadDemo = async () => {
    setBusy(true);
    try { const r = await api.post('/demo/load'); toast.success(`Demo dataset loaded: ${r.data.summary.students} students, ${r.data.summary.faculty} faculty, ${r.data.summary.rooms} rooms, ${r.data.summary.subjects} subjects`); reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (loading && !data) return <PageLoader />;
  if (!data) return null;
  const t = data.totals;
  const ch = data.charts;
  const isEmpty = !t.students && !t.subjects && !t.rooms;

  const quick = [['/students', 'Add Student', Plus], ['/faculty', 'Add Faculty', Plus], ['/rooms', 'Add Room', Plus], ['/subjects', 'Add Subject', Plus], ['/time-slots', 'Manage Time Slots', Clock], ['/optimizer', 'Generate Examination Timetable', Cpu], ['/timetable', 'View Final Schedule', CalendarDays]];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={data.period ? `${data.period.name} - ${data.period.session_name}` : 'No examination period configured yet'}
        actions={<><Link to="/import" className="btn-primary"><Upload className="h-4 w-4" /> Import My Dataset</Link><button className="btn-secondary" onClick={loadDemo} disabled={busy}>{busy ? <Spinner className="!h-4 !w-4" /> : <Database className="h-4 w-4" />} Load Demo Dataset</button></>} />

      {isEmpty && (
        <Card className="mb-6"><EmptyState title="Your database is empty" message="Add departments, students, faculty, rooms and subjects - import your own dataset from Excel/CSV, or load the demo dataset to try the whole workflow."
          action={<div className="flex gap-2"><Link to="/import" className="btn-primary"><Upload className="h-4 w-4" /> Import My Dataset</Link><button className="btn-secondary" onClick={loadDemo} disabled={busy}><Database className="h-4 w-4" /> Load Demo Dataset</button></div>} /></Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Students" value={t.students} icon={GraduationCap} />
        <StatCard label="Faculty" value={t.faculty} icon={Users} tone="sky" />
        <StatCard label="Subjects" value={t.subjects} icon={BookOpen} tone="violet" />
        <StatCard label="Exam rooms" value={t.rooms} icon={DoorOpen} tone="amber" />
        <StatCard label="Exams scheduled" value={`${data.scheduledExams ?? 0}/${data.totalExams ?? 0}`} icon={ClipboardCheck} tone="green" />
        <StatCard label="Available slots" value={data.usableSlots ?? 0} icon={CalendarClock} tone="sky" />
        <StatCard label="Scheduling conflicts" value={data.conflicts ?? 0} icon={ShieldAlert} tone={data.conflicts ? 'rose' : 'green'} hint={data.hasSchedule ? (data.conflicts ? 'Hard violations found' : 'All hard constraints satisfied') : 'No timetable yet'} />
        <StatCard label="Room utilization" value={`${num(data.roomUtilization)}%`} icon={Gauge} tone="amber" />
        <StatCard label="Faculty utilization" value={`${num(data.facultyUtilization)}%`} icon={UserCheck} tone="violet" />
        <StatCard label="Student coverage" value={`${num(data.studentCoverage)}%`} icon={Target} tone="green" hint={data.studentsEnrolled ? `${data.studentsCovered}/${data.studentsEnrolled} students fully scheduled` : undefined} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {quick.map(([to, label, Icon]) => <Link key={label} to={to} className={to === '/optimizer' ? 'btn-primary' : 'btn-secondary'}><Icon className="h-4 w-4" />{label}</Link>)}
      </div>

      {!data.hasSchedule ? (
        <Card className="mt-6"><EmptyState icon={Cpu} title="No timetable generated yet" message="Charts appear here once the AI Optimizer has produced a timetable."
          action={<button className="btn-primary" onClick={() => nav('/optimizer')}><Cpu className="h-4 w-4" /> Open AI Optimizer</button>} /></Card>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">Showing run <b className="text-slate-700">#{data.run.id}</b> <Badge tone={data.run.is_published ? 'green' : 'amber'}>{data.run.is_published ? 'Published' : 'Draft'}</Badge> <Badge tone={data.run.validation_status === 'valid' ? 'green' : 'red'}>{data.run.validation_status}</Badge></div>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <Chart title="Exams scheduled per day">
              <BarChart data={ch.examsPerDay.map((d) => ({ ...d, label: fmtShort(d.date) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip {...tip} /><Bar dataKey="count" name="Exams" fill={C.indigo} radius={[4, 4, 0, 0]} /></BarChart>
            </Chart>
            <Chart title="Room utilization" subtitle="Share of usable slots in which each room is booked">
              <BarChart data={ch.roomUtilization}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={10} interval={0} angle={-20} textAnchor="end" height={50} /><YAxis unit="%" fontSize={12} /><Tooltip {...tip} /><Bar dataKey="utilization" name="Utilization %" fill={C.amber} radius={[4, 4, 0, 0]} /></BarChart>
            </Chart>
            <Chart title="Faculty workload distribution" subtitle="Invigilation duties vs maximum workload">
              <BarChart data={ch.facultyWorkload}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={10} interval={0} angle={-25} textAnchor="end" height={55} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip {...tip} /><Legend /><Bar dataKey="duties" name="Duties" fill={C.indigo} radius={[4, 4, 0, 0]} /><Bar dataKey="max" name="Max workload" fill={C.slate} radius={[4, 4, 0, 0]} /></BarChart>
            </Chart>
            <Chart title="Examination distribution across time slots">
              <PieChart><Pie data={ch.examsPerSlot} dataKey="count" nameKey="slot" innerRadius={55} outerRadius={90} paddingAngle={2} label>{ch.examsPerSlot.map((_, i) => <Cell key={i} fill={[C.indigo, C.sky, C.green, C.amber][i % 4]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart>
            </Chart>
            <Chart title="Initial cost vs optimized cost" subtitle="Lower is better">
              <BarChart data={ch.costComparison}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip {...tip} /><Legend /><Bar dataKey="initial" name="Initial" fill={C.slate} radius={[4, 4, 0, 0]} /><Bar dataKey="optimized" name="Optimized" fill={C.green} radius={[4, 4, 0, 0]} /></BarChart>
            </Chart>
            <Chart title="Scheduling conflict statistics" empty={!ch.conflictStats.length && 'No conflicts - every hard constraint is satisfied'}>
              <BarChart data={ch.conflictStats.map((c) => ({ ...c, label: CONFLICT_LABELS[c.type] || c.type }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} fontSize={12} /><YAxis type="category" dataKey="label" width={130} fontSize={11} /><Tooltip {...tip} /><Bar dataKey="count" name="Conflicts">{ch.conflictStats.map((c) => <Cell key={c.type} fill={CONFLICT_COLORS[c.type] || C.rose} />)}</Bar></BarChart>
            </Chart>
          </div>
          {ch.convergence?.length > 1 && (
            <div className="mt-6">
              <Chart title="Optimization convergence" subtitle="Cost per iteration of the latest run">
                <LineChart data={ch.convergence}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="iteration" fontSize={12} /><YAxis fontSize={12} /><Tooltip {...tip} /><Legend /><Line dot={false} dataKey="current" name="Current cost" stroke={C.slate} strokeWidth={1.5} isAnimationActive={false} /><Line dot={false} dataKey="best" name="Best cost" stroke={C.green} strokeWidth={2.5} isAnimationActive={false} /></LineChart>
              </Chart>
            </div>
          )}
        </>
      )}
    </>
  );
}
