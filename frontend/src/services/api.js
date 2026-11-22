import axios from 'axios';

export const TOKEN_KEY = 'examai_token';
const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e) => e?.response?.data?.error || e?.message || 'Something went wrong';
export const token = () => localStorage.getItem(TOKEN_KEY);

/** Authenticated file download (reports). */
export async function download(url, params) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || 'report';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(res.data);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default api;
