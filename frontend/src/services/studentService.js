import api from './api';

export const list = (params) => api.get('/students', { params }).then((r) => r.data);
export const get = (id) => api.get(`/students/${id}`).then((r) => r.data);
export const create = (data) => api.post('/students', data).then((r) => r.data);
export const update = (id, data) => api.put(`/students/${id}`, data).then((r) => r.data);
export const remove = (id) => api.delete(`/students/${id}`).then((r) => r.data);
export const schedule = (id, params) => api.get(`/students/${id}/schedule`, { params }).then((r) => r.data);
