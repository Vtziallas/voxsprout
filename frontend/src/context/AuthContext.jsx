import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [therapist, setTherapist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      auth.me()
        .then(res => setTherapist(res.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await auth.login(email, password);
    localStorage.setItem('token', res.data.access_token);
    const me = await auth.me();
    setTherapist(me.data);
    return me.data;
  };

  const register = async (data) => {
    await auth.register(data);
    return login(data.email, data.password);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setTherapist(null);
  };

  return (
    <AuthContext.Provider value={{ therapist, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
