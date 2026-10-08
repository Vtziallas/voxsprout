import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', preferred_language: 'en' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)', padding: '16px'
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            fontSize: '28px', fontWeight: '700', color: 'var(--primary)',
            letterSpacing: '-0.5px', marginBottom: '6px'
          }}>
            LogotherapyPro
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            AI-powered speech therapy assessment
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', marginBottom: '24px', background: 'var(--bg)', borderRadius: '8px', padding: '4px' }}>
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '500',
                  background: mode === m ? 'white' : 'transparent',
                  color: mode === m ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: mode === m ? 'var(--shadow)' : 'none',
                  transition: 'all .2s',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input className="form-input" value={form.name} onChange={set('name')} required placeholder="Dr. Anna Smith" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={set('email')} required placeholder="you@clinic.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password} onChange={set('password')} required placeholder="••••••••" />
            </div>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">Preferred language</label>
                <select className="form-select" value={form.preferred_language} onChange={set('preferred_language')}>
                  <option value="en">English</option>
                  <option value="el">Greek (Ελληνικά)</option>
                </select>
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '8px', padding: '11px' }} disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
