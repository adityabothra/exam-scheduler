import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { errMsg } from '../services/api';

/** Loads data from an async function; re-runs when deps change; exposes reload(). */
export default function useFetch(fn, deps = [], { initial = null, silent = false } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(errMsg(e));
      if (!silent) toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [silent]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, loading, error, reload, setData };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
