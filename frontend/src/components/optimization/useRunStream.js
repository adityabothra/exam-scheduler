import { useCallback, useEffect, useRef, useState } from 'react';
import { token } from '../../services/api';

const MAX_LOGS = 1500;

/**
 * Subscribes to the backend Server-Sent Events stream of one optimisation run.
 * Everything exposed here is exactly what the algorithm emitted - nothing is simulated client-side.
 */
export default function useRunStream(runId) {
  const [state, setState] = useState({ status: 'idle', last: null, logs: [], points: [], result: null, config: null });
  const esRef = useRef(null);

  const close = useCallback(() => { esRef.current?.close(); esRef.current = null; }, []);

  useEffect(() => {
    if (!runId) { setState({ status: 'idle', last: null, logs: [], points: [], result: null, config: null }); return undefined; }
    const es = new EventSource(`/api/optimization/${runId}/stream?token=${encodeURIComponent(token())}`);
    esRef.current = es;
    setState({ status: 'running', last: null, logs: [], points: [], result: null, config: null });

    es.addEventListener('snapshot', (e) => {
      const s = JSON.parse(e.data);
      setState({ status: s.status, last: s.last, logs: s.logs.slice(-MAX_LOGS), points: s.points, result: s.result, config: s.config });
    });
    es.addEventListener('progress', (e) => {
      const p = JSON.parse(e.data);
      setState((st) => ({ ...st, status: st.status === 'paused' ? 'paused' : 'running', last: p, logs: [...st.logs, ...p.logs].slice(-MAX_LOGS), points: [...st.points, ...p.points] }));
    });
    es.addEventListener('status', (e) => setState((st) => ({ ...st, status: JSON.parse(e.data).status })));
    es.addEventListener('complete', (e) => { const r = JSON.parse(e.data); setState((st) => ({ ...st, status: r.status, result: r })); es.close(); });
    es.onerror = () => { /* the server closes the stream after completion; EventSource would retry - stop it */ if (es.readyState === EventSource.CLOSED) return; };
    return () => es.close();
  }, [runId]);

  return { ...state, close };
}
