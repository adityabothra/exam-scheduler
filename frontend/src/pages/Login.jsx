import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Sparkles, LogIn } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../services/api';
import { Spinner } from '../components/common/UI';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: 'admin', password: 'admin123' });
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await login(f.username, f.password); nav('/'); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5"><div className="rounded-lg bg-brand-500 p-1.5"><Sparkles className="h-5 w-5" /></div><span className="text-lg font-bold">ExamAI</span></div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Conflict-free exam timetables,<br />found by annealing.</h1>
          <p className="mt-4 max-w-md text-slate-300">Watch Simulated Annealing cool a random timetable into an optimised one - live - while hard constraints stay satisfied at every step.</p>
        </div>
        <p className="text-xs text-slate-500">AI-based University Examination Scheduling and Optimization System</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-7">
          <div><h2 className="text-xl font-bold text-ink">Administrator sign in</h2><p className="text-sm text-slate-500">Demo credentials are pre-filled.</p></div>
          <label className="block"><span className="label">Username</span><input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus required /></label>
          <label className="block"><span className="label">Password</span><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <LogIn className="h-4 w-4" />} Sign in</button>
        </form>
      </div>
    </div>
  );
}
