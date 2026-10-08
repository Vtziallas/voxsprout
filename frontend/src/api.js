import axios from 'axios';

const API = axios.create({ baseURL: 'http://localhost:8000' });

API.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (email, password) => {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);
    return API.post('/auth/login', form);
  },
  register: (data) => API.post('/auth/register', data),
  me: () => API.get('/auth/me'),
};

export const patients = {
  list: () => API.get('/patients'),
  create: (data) => API.post('/patients', data),
  get: (id) => API.get(`/patients/${id}`),
  update: (id, data) => API.patch(`/patients/${id}`, data),
  delete: (id) => API.delete(`/patients/${id}`),
};

export const sessions = {
  create: (data) => API.post('/sessions', data),
  list: () => API.get('/sessions'),
  listForPatient: (patientId) => API.get(`/sessions/patient/${patientId}`),
  getWords: (language) => API.get(`/sessions/words/${language}`),
  record: (sessionId, wordId, audioBlob) => {
    const form = new FormData();
    form.append('audio', audioBlob, `${wordId}.wav`);
    return API.post(`/sessions/${sessionId}/record/${wordId}`, form);
  },
  getResults: (sessionId) => API.get(`/sessions/${sessionId}/results`),
  getFeatures: (sessionId) => API.get(`/sessions/${sessionId}/features`),
  complete: (sessionId) => API.post(`/sessions/${sessionId}/complete`),
};

export const feedback = {
  submit: (data) => API.post('/feedback', data),
};

export const training = {
  getStats: (language) => API.get(`/training/stats/${language}`),
  triggerRetrain: (language) => API.post(`/training/retrain/${language}`),
  getVersions: () => API.get('/training/versions'),
  getLabelingQueue: (language, limit = 100) =>
    API.get(`/training/labeling-queue?language=${language}&limit=${limit}`),
};
