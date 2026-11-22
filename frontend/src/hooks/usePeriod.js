import { useState } from 'react';
import api from '../services/api';
import useFetch from './useFetch';

/** Examination periods with a selected one (defaults to the active period). */
export default function usePeriod() {
  const { data: periods, reload, loading } = useFetch(() => api.get('/periods').then((r) => r.data), [], { initial: [] });
  const [sel, setSel] = useState(null);
  const period = periods.find((p) => p.id === sel) || periods.find((p) => p.is_active) || periods[0] || null;
  return { periods, period, setPeriod: setSel, reload, loading };
}
