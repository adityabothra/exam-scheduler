import api from './api';

export const list = (params) => api.get('/subjects', { params }).then((r) => r.data);
export const get = (id) => api.get(`/subjects/${id}`).then((r) => r.data);
export const create = (data) => api.post('/subjects', data).then((r) => r.data);
export const update = (id, data) => api.put(`/subjects/${id}`, data).then((r) => r.data);
export const remove = (id) => api.delete(`/subjects/${id}`).then((r) => r.data);
export const schedule = (id, params) => api.get(`/subjects/${id}/schedule`, { params }).then((r) => r.data);
