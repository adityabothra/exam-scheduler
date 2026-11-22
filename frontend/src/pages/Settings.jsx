import { useState } from 'react';
import { Database, Trash2, KeyRound, Building } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Card, ConfirmDialog, Field, PageHeader, Spinner } from '../components/common/UI';

export default function Settings() {
  const { data, setData } = useFetch(() => api.get('/settings').then((r) => r.data));
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);
  const run = async (key, fn, msg) => { setBusy(key); try { await fn(); toast.success(msg); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); } };

  return (
    <>
      <PageHeader title="Settings" subtitle="University details, account security and demo data." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="University" subtitle="Printed on every exported report">
          <Field label="University name"><input className="input" value={data?.university_name || ''} onChange={(e) => setData({ ...data, university_name: e.target.value })} /></Field>
          <button className="btn-primary mt-4" disabled={busy === 'u'} onClick={() => run('u', () => api.put('/settings', data), 'Saved')}>{busy === 'u' ? <Spinner className="!h-4 !w-4 !text-white" /> : <Building className="h-4 w-4" />} Save</button>
        </Card>
        <Card title="Change password">
          <div className="space-y-3"><Field label="Current password"><input className="input" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password" hint="At least 6 characters"><input className="input" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field></div>
          <button className="btn-primary mt-4" disabled={busy === 'p'} onClick={() => run('p', async () => { await api.post('/auth/change-password', pw); setPw({ current_password: '', new_password: '' }); }, 'Password updated')}><KeyRound className="h-4 w-4" /> Update password</button>
        </Card>
        <Card title="Demo data" subtitle="Both actions replace or remove ALL university data (accounts and settings are kept)" className="lg:col-span-2">
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => setConfirm('load')}><Database className="h-4 w-4" /> Load demo dataset</button>
            <button className="btn-danger" onClick={() => setConfirm('clear')}><Trash2 className="h-4 w-4" /> Clear all data</button>
          </div>
        </Card>
      </div>
      <ConfirmDialog open={!!confirm} danger={confirm === 'clear'} confirmText={confirm === 'load' ? 'Load demo data' : 'Delete everything'} busy={!!busy} onClose={() => setConfirm(null)}
        message={confirm === 'load' ? 'This replaces all current students, faculty, rooms, subjects, slots and timetables with the demo dataset.' : 'This permanently deletes all students, faculty, rooms, subjects, slots, timetables and optimization history.'}
        onConfirm={async () => { const k = confirm; await run('d', () => api.post(k === 'load' ? '/demo/load' : '/demo/clear'), k === 'load' ? 'Demo dataset loaded' : 'All data cleared'); setConfirm(null); }} />
    </>
  );
}
