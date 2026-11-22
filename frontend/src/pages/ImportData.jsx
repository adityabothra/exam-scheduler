import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileSpreadsheet, FileDown, FileText, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Info, ArrowRight } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { download, errMsg } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Badge, Card, ConfirmDialog, PageHeader, Select, Spinner } from '../components/common/UI';

function FilePicker({ file, setFile, accept, label }) {
  const ref = useRef();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => setFile(e.target.files[0] || null)} />
      <button className="btn-secondary" onClick={() => ref.current.click()}><Upload className="h-4 w-4" /> {label}</button>
      <span className="text-sm text-slate-500">{file ? <><b className="text-slate-700">{file.name}</b> ({(file.size / 1024).toFixed(1)} KB)</> : 'No file chosen'}</span>
    </div>
  );
}

function Results({ data }) {
  const [open, setOpen] = useState({});
  const totalOk = data.results.reduce((a, r) => a + r.created + r.updated + r.unchanged, 0);
  const totalFail = data.results.reduce((a, r) => a + r.failed, 0);
  return (
    <Card className="mt-6" title="Import result" actions={<Badge tone={totalFail ? 'amber' : 'green'}>{totalOk} row(s) imported{totalFail ? `, ${totalFail} failed` : ''}</Badge>}>
      {data.replaced && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Existing data was cleared before importing.</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr><th className="th">Sheet</th><th className="th text-right">Rows</th><th className="th text-right">Created</th><th className="th text-right">Updated</th><th className="th text-right">Failed</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.results.map((r) => (
              <>
                <tr key={r.entity} className={r.errors.length ? 'cursor-pointer hover:bg-slate-50' : ''} onClick={() => r.errors.length && setOpen({ ...open, [r.entity]: !open[r.entity] })}>
                  <td className="td font-medium">{r.title}</td><td className="td text-right">{r.total}</td>
                  <td className="td text-right text-emerald-700">{r.created}</td><td className="td text-right text-sky-700">{r.updated}</td>
                  <td className="td text-right">{r.failed ? <span className="font-semibold text-rose-600">{r.failed}</span> : <span className="text-slate-400">0</span>}</td>
                  <td className="td text-right">{r.errors.length ? (open[r.entity] ? <ChevronDown className="inline h-4 w-4" /> : <ChevronRight className="inline h-4 w-4" />) : <CheckCircle2 className="inline h-4 w-4 text-emerald-500" />}</td>
                </tr>
                {open[r.entity] && r.errors.map((e, i) => (
                  <tr key={`${r.entity}-${i}`} className="bg-rose-50/60"><td className="td" colSpan={6}><span className="mr-2 inline-block w-16 font-mono text-xs text-rose-700">row {e.row}</span><span className="text-rose-800">{e.message}</span></td></tr>))}
              </>))}
          </tbody>
        </table>
      </div>
      {data.ignored_sheets?.length > 0 && <p className="mt-3 text-xs text-slate-500">Ignored sheets (not recognised): {data.ignored_sheets.join(', ')}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <span className="text-sm text-slate-600">{data.examinations_created > 0 ? `${data.examinations_created} examination(s) were created from subjects that have enrolled students.` : 'No new examinations were created.'}</span>
        <div className="ml-auto flex gap-2"><Link to="/examinations" className="btn-secondary">Examination management</Link><Link to="/optimizer" className="btn-primary">Run AI Optimizer <ArrowRight className="h-4 w-4" /></Link></div>
      </div>
    </Card>
  );
}

export default function ImportData() {
  const spec = useFetch(() => api.get('/import/describe').then((r) => r.data), [], { initial: [], silent: true });
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [gen, setGen] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const [entity, setEntity] = useState('students');
  const [file2, setFile2] = useState(null);
  const [busy2, setBusy2] = useState(false);
  const [dl, setDl] = useState('');

  const send = async (url, f, extra, setB) => {
    setB(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
      const { data } = await api.post(url, fd);
      setResult(data);
      const ok = data.results.reduce((a, r) => a + r.created + r.updated, 0), bad = data.results.reduce((a, r) => a + r.failed, 0);
      toast[bad ? 'warning' : 'success'](`Imported ${ok} row(s)${bad ? `, ${bad} failed - see details` : ''}`);
    } catch (e) {
      const d = e?.response?.data;
      if (d?.results) { setResult(d); toast.error('Nothing could be imported - see details below'); } else toast.error(errMsg(e));
    } finally { setB(false); }
  };

  const get = async (key, url, params) => { setDl(key); try { await download(url, params); } catch (e) { toast.error(errMsg(e)); } finally { setDl(''); } };
  const info = spec.data.find((s) => s.entity === entity);

  return (
    <>
      <PageHeader title="Import Dataset" subtitle="Bring your own university data instead of the demo dataset. Upload one Excel workbook with everything, or a CSV for a single table." />

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card title="1. Import a complete dataset (Excel)" subtitle="One workbook, one sheet per table. Sheets you leave empty are skipped.">
            <div className="mb-4 flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={!!dl} onClick={() => get('blank', '/import/template', { kind: 'blank' })}>{dl === 'blank' ? <Spinner className="!h-4 !w-4" /> : <FileSpreadsheet className="h-4 w-4" />} Download blank template</button>
              <button className="btn-secondary" disabled={!!dl} onClick={() => get('sample', '/import/template', { kind: 'sample' })}>{dl === 'sample' ? <Spinner className="!h-4 !w-4" /> : <FileDown className="h-4 w-4" />} Download filled sample</button>
            </div>
            <FilePicker file={file} setFile={setFile} accept=".xlsx" label="Choose .xlsx file" />
            <div className="mt-4 space-y-2 text-sm">
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={gen} onChange={(e) => setGen(e.target.checked)} /><span>Create examinations automatically for every subject that has enrolled students</span></label>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span><b className="text-rose-700">Replace existing data</b> - deletes all current students, faculty, rooms, subjects, slots and timetables first (use this to swap out the demo data)</span></label>
            </div>
            <button className="btn-primary mt-5" disabled={!file || busy} onClick={() => (replace ? setConfirm(true) : send('/import/bundle', file, { replace: false, generate_exams: gen }, setBusy))}>
              {busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <Upload className="h-4 w-4" />} Import workbook
            </button>
          </Card>

          <Card title="2. Import a single table (CSV or Excel)" subtitle="Add or correct one kind of data without touching the rest.">
            <div className="grid gap-3 sm:grid-cols-[16rem_1fr]">
              <Select value={entity} onChange={setEntity} options={spec.data.map((s) => [s.entity, s.title])} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={!!dl} onClick={() => get('c1', `/import/template/${entity}`)}>{dl === 'c1' ? <Spinner className="!h-4 !w-4" /> : <FileText className="h-4 w-4" />} CSV template</button>
                <button className="btn-secondary" disabled={!!dl} onClick={() => get('c2', `/import/template/${entity}`, { kind: 'sample' })}>{dl === 'c2' ? <Spinner className="!h-4 !w-4" /> : <FileDown className="h-4 w-4" />} Sample data</button>
              </div>
            </div>
            {info && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm"><thead><tr><th className="th">Column</th><th className="th">Meaning</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{info.columns.map((c) => <tr key={c.name}><td className="td font-mono text-xs font-semibold">{c.name}{c.required && <span className="ml-1 text-rose-500">*</span>}</td><td className="td text-slate-600">{c.help}</td></tr>)}</tbody></table>
              </div>)}
            <div className="mt-4"><FilePicker file={file2} setFile={setFile2} accept=".csv,.xlsx" label="Choose .csv or .xlsx" /></div>
            <button className="btn-primary mt-4" disabled={!file2 || busy2} onClick={() => send(`/import/${entity}`, file2, { generate_exams: true }, setBusy2)}>{busy2 ? <Spinner className="!h-4 !w-4 !text-white" /> : <Upload className="h-4 w-4" />} Import {info?.title?.toLowerCase()}</button>
          </Card>
        </div>

        <Card title="How it works" className="h-fit">
          <ul className="space-y-3 text-sm text-slate-600">
            {[
              ['Order matters', 'Departments → courses → faculty → subjects → rooms → students → period → time slots → unavailability. Later sheets refer to earlier ones by code (e.g. department_code).'],
              ['Safe to re-run', 'Rows with an existing code are updated, never duplicated. Fix your file and import it again.'],
              ['Errors don\'t stop the import', 'Bad rows are skipped and listed with their row number; good rows are still saved.'],
              ['Enrolments', 'Put subject codes separated by ; in the students sheet (or use the enrollments sheet). They define which exams must not clash.'],
              ['Dates & times', 'YYYY-MM-DD or DD/MM/YYYY; 24-hour HH:MM or 9:00 AM. Real Excel date/time cells work too.'],
              ['Availability', 'Only list what is NOT available. Leave the slot label blank to block a whole day.'],
            ].map(([t, d]) => <li key={t} className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /><span><b className="text-slate-800">{t}.</b> {d}</span></li>)}
          </ul>
        </Card>
      </div>

      {result && <Results data={result} />}
      <ConfirmDialog open={confirm} danger confirmText="Delete & import" onClose={() => setConfirm(false)}
        message="This permanently deletes ALL current students, faculty, rooms, subjects, time slots, timetables and optimization history, then imports your file."
        onConfirm={() => { setConfirm(false); send('/import/bundle', file, { replace: true, generate_exams: gen }, setBusy); }} />
    </>
  );
}
