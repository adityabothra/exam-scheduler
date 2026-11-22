import api from './api';

export const getConfig = () => api.get('/optimization/config').then((r) => r.data);
export const saveConfig = (c) => api.put('/optimization/config', c).then((r) => r.data);
export const resetConfig = () => api.post('/optimization/config/reset').then((r) => r.data);
export const feasibility = () => api.get('/optimization/feasibility').then((r) => r.data);
export const start = (body) => api.post('/optimization/start', body).then((r) => r.data);
export const active = () => api.get('/optimization/active').then((r) => r.data);
export const pause = (id) => api.post(`/optimization/${id}/pause`).then((r) => r.data);
export const resume = (id) => api.post(`/optimization/${id}/resume`).then((r) => r.data);
export const cancel = (id) => api.post(`/optimization/${id}/cancel`).then((r) => r.data);
export const history = () => api.get('/optimization/history').then((r) => r.data);
export const getRun = (id) => api.get(`/optimization/${id}`).then((r) => r.data);
export const removeRun = (id) => api.delete(`/optimization/${id}`).then((r) => r.data);
