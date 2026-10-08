import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { training } from '../api';
import { DISORDERS } from '../i18n';

function ModelCard({ language, label }) {
  const [stats, setStats] = useState(null);
  const [retraining, setRetraining] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    training.getStats(language).then(r => setStats(r.data)).catch(() => {});
  }, [language]);

  const triggerRetrain = async () => {
    setRetraining(true);
    setMessage('');
    try {
      await training.triggerRetrain(language);
      setMessage('Retraining started in the background. Refresh in a moment to see the new version.');
    } catch {
      setMessage('Failed to start retraining.');
    } finally {
      setRetraining(false);
    }
  };

  const active = stats?.active_model;
  const pending = stats?.pending_labels ?? 0;
  const until = stats?.labels_until_retrain ?? 0;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{label} Model</div>
        <span style={{
          padding: '3px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: '600',
          background: active ? 'var(--success-bg)' : 'var(--bg)',
          color: active ? 'var(--success)' : 'var(--text-muted)',
        }}>
          {active ? `Active: ${active.version_tag}` : 'No model yet'}
        </span>
      </div>

      {active && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Accuracy', value: active.accuracy != null ? `${(active.accuracy * 100).toFixed(1)}%` : '—' },
            { label: 'F1 Score', value: active.f1_score != null ? `${(active.f1_score * 100).toFixed(1)}%` : '—' },
            { label: 'Training samples', value: active.training_samples },
          ].map(({ label: lbl, value }) => (
            <div key={lbl} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{lbl}</div>
              <div style={{ fontSize: '22px', fontWeight: '700', marginTop: '4px' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {!active && (
        <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '16px', marginBottom: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
          The AI is currently using rule-based detection. Once {stats?.pending_labels ?? 0} more therapist corrections are collected (50 total), it will automatically train a machine learning model.
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span className="text-sm text-muted">Labels until next auto-retrain</span>
          <span className="text-sm" style={{ fontWeight: '600' }}>
            {pending} new · {until} more needed
          </span>
        </div>
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{ width: `${Math.min(100, (pending / 20) * 100)}%` }} />
        </div>
      </div>

      {message && (
        <div className={`alert ${message.includes('Failed') ? 'alert-error' : 'alert-success'}`}>
          {message}
        </div>
      )}

      <button className="btn btn-outline" onClick={triggerRetrain} disabled={retraining || pending < 5}>
        {retraining ? 'Starting...' : 'Trigger Manual Retrain'}
      </button>
      {pending < 5 && <span className="text-sm text-muted" style={{ marginLeft: '10px' }}>Need at least 5 new labels</span>}

      {stats?.all_versions?.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>Version History</div>
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Accuracy</th>
                <th>F1</th>
                <th>Samples</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stats.all_versions.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: '600' }}>{v.version_tag}</td>
                  <td>{v.accuracy != null ? `${(v.accuracy * 100).toFixed(1)}%` : '—'}</td>
                  <td>{v.f1_score != null ? `${(v.f1_score * 100).toFixed(1)}%` : '—'}</td>
                  <td>{v.training_samples}</td>
                  <td>{new Date(v.created_at).toLocaleDateString()}</td>
                  <td>{v.is_active && <span style={{ color: 'var(--success)', fontWeight: '600', fontSize: '12px' }}>ACTIVE</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TrainingDashboard() {
  return (
    <div className="layout">
      <Header />
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <Link to="/" className="btn btn-ghost btn-sm">← Dashboard</Link>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700' }}>AI Model</h1>
            <p className="text-muted text-sm">Active learning — the model improves as therapists give feedback</p>
          </div>
        </div>

        <div style={{ background: 'var(--primary-bg)', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', fontSize: '14px', color: 'var(--primary)' }}>
          <strong>How it works:</strong> Every time you click "Correct" on an assessment result, that correction becomes training data.
          After 20 new corrections, the model automatically retrains and improves. You can also trigger a retrain manually below.
        </div>

        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ fontWeight: '600', fontSize: '14px' }}>Bootstrap with Bulk Labeling</div>
            <div className="text-sm text-muted" style={{ marginTop: '2px' }}>
              Label existing recordings quickly — keyboard shortcuts, one by one. Great for training the first model.
            </div>
          </div>
          <Link to="/labeling" className="btn btn-outline" style={{ whiteSpace: 'nowrap' }}>
            Open Labeling Tool
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <ModelCard language="el" label="Greek" />
          <ModelCard language="en" label="English" />
        </div>
      </div>
    </div>
  );
}
