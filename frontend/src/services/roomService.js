import api from './api';

export const list = (params) => api.get('/rooms', { params }).then((r) => r.data);
export const get = (id) => api.get(`/rooms/${id}`).then((r) => r.data);
export const create = (data) => api.post('/rooms', data).then((r) => r.data);
export const update = (id, data) => api.put(`/rooms/${id}`, data).then((r) => r.data);
export const remove = (id) => api.delete(`/rooms/${id}`).then((r) => r.data);
export const schedule = (id, params) => api.get(`/rooms/${id}/schedule`, { params }).then((r) => r.data);
