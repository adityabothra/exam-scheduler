import api from './api';

export const list = (params) => api.get('/faculty', { params }).then((r) => r.data);
export const get = (id) => api.get(`/faculty/${id}`).then((r) => r.data);
export const create = (data) => api.post('/faculty', data).then((r) => r.data);
export const update = (id, data) => api.put(`/faculty/${id}`, data).then((r) => r.data);
export const remove = (id) => api.delete(`/faculty/${id}`).then((r) => r.data);
export const schedule = (id, params) => api.get(`/faculty/${id}/schedule`, { params }).then((r) => r.data);
