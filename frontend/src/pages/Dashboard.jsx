import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../components/Header';
import { patients, sessions } from '../api';

function NewPatientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', date_of_birth: '', language: 'el', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await patients.create(form);
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">New Patient</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Full name *</label>
            <input className="form-input" value={form.name} onChange={set('name')} required placeholder="Child's name" />
          </div>
          <div className="form-group">
            <label className="form-label">Date of birth</label>
            <input className="form-input" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
          </div>
          <div className="form-group">
            <label className="form-label">Assessment language</label>
            <select className="form-select" value={form.language} onChange={set('language')}>
              <option value="el">Greek (Ελληνικά)</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={form.notes} onChange={set('notes')} placeholder="Clinical notes..." />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewSessionModal({ patient, onClose, onCreated }) {
  const [language, setLanguage] = useState(patient.language || 'el');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const start = async () => {
    setLoading(true);
    try {
      const res = await sessions.create({ patient_id: patient.id, language });
      onClose();
      navigate(`/sessions/new?sessionId=${res.data.id}&patientId=${patient.id}&language=${language}`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Start Assessment — {patient.name}</div>
        <div className="form-group">
          <label className="form-label">Assessment language</label>
          <select className="form-select" value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="el">Greek (Ελληνικά)</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={start} disabled={loading}>
            {loading ? 'Starting...' : 'Begin Assessment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ageLabel(dob) {
  if (!dob) return null;
  const months = Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 30.4));
  if (months < 24) return `${months}mo`;
  return `${Math.floor(months / 12)}y ${months % 12}mo`;
}

export default function Dashboard() {
  const [patientList, setPatientList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [sessionTarget, setSessionTarget] = useState(null);

  useEffect(() => {
    patients.list().then(r => setPatientList(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="layout">
      <Header />
      {showNewPatient && (
        <NewPatientModal
          onClose={() => setShowNewPatient(false)}
          onCreated={(p) => { setPatientList(l => [p, ...l]); setShowNewPatient(false); }}
        />
      )}
      {sessionTarget && (
        <NewSessionModal
          patient={sessionTarget}
          onClose={() => setSessionTarget(null)}
          onCreated={() => {}}
        />
      )}
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Patients</h1>
            <p className="text-muted text-sm">{patientList.length} patient{patientList.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNewPatient(true)}>
            + New Patient
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <div className="spinner" />
          </div>
        ) : patientList.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <h3>No patients yet</h3>
              <p>Add your first patient to get started.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {patientList.map(p => (
              <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '18px 24px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: 'var(--primary-bg)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '18px', flexShrink: 0
                }}>
                  {p.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '15px' }}>{p.name}</div>
                  <div className="text-sm text-muted" style={{ marginTop: '2px' }}>
                    {ageLabel(p.date_of_birth) && <span>{ageLabel(p.date_of_birth)} · </span>}
                    <span style={{ textTransform: 'uppercase', letterSpacing: '.4px', fontSize: '11px' }}>
                      {p.language === 'el' ? 'Greek' : 'English'}
                    </span>
                    {p.notes && <span> · {p.notes.slice(0, 60)}{p.notes.length > 60 ? '…' : ''}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <Link to={`/patients/${p.id}`} className="btn btn-ghost btn-sm">History</Link>
                  <button className="btn btn-primary btn-sm" onClick={() => setSessionTarget(p)}>
                    Start Assessment
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
