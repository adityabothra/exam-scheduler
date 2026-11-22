import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, GraduationCap, Users, BookOpen, DoorOpen, Clock, CalendarCheck, ClipboardList, Cpu, History, ShieldAlert, CalendarDays, FileText, Settings as Cog, Upload, Menu, X, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  ['/', 'Dashboard', LayoutDashboard], ['/students', 'Students', GraduationCap], ['/faculty', 'Faculty', Users], ['/subjects', 'Subjects', BookOpen],
  ['/rooms', 'Examination Rooms', DoorOpen], ['/time-slots', 'Time Slots', Clock], ['/availability', 'Availability', CalendarCheck], ['/examinations', 'Examination Management', ClipboardList],
  ['/optimizer', 'AI Optimizer', Cpu], ['/history', 'Optimization History', History], ['/conflicts', 'Conflict Detection', ShieldAlert],
  ['/timetable', 'Examination Timetable', CalendarDays], ['/reports', 'Reports', FileText], ['/import', 'Import Dataset', Upload], ['/settings', 'Settings', Cog],
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const title = NAV.find(([p]) => (p === '/' ? pathname === '/' : pathname.startsWith(p)))?.[1] || '';

  const sidebar = (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-lg bg-brand-500 p-1.5 text-white"><Sparkles className="h-5 w-5" /></div>
        <div className="leading-tight"><p className="font-bold text-white">ExamAI</p><p className="text-[11px] text-slate-400">Exam scheduling</p></div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-500 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
            <Icon className="h-4 w-4 shrink-0" /> {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="btn-ghost !p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        <h2 className="font-semibold text-ink">{title}</h2>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block"><p className="text-sm font-medium text-slate-700">{user?.name}</p><p className="text-xs capitalize text-slate-400">{user?.role}</p></div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{user?.name?.[0] || 'A'}</div>
          <button className="btn-ghost !p-2" onClick={logout} title="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] p-4 sm:p-6"><Outlet /></main>
    </div>
  );
}
