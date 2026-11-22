import { useState } from 'react';
import { toast } from 'react-toastify';
import { errMsg } from '../../services/api';

/** Shared save/delete plumbing: toasts, busy flag, and reload. */
export function useCrud({ service, reload, noun }) {
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const save = async (id, payload) => {
    setBusy(true);
    try {
      if (id) await service.update(id, payload); else await service.create(payload);
      toast.success(`${noun} ${id ? 'updated' : 'created'}`);
      await reload();
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try { await service.remove(toDelete.id); toast.success(`${noun} deleted`); setToDelete(null); await reload(); }
    catch (e) { toast.error(errMsg(e)); setToDelete(null); } finally { setBusy(false); }
  };
  return { busy, save, toDelete, setToDelete, confirmDelete };
}
