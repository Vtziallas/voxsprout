import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { training, feedback } from '../api';
import { DISORDERS, disorder } from '../i18n';

const API_URL = 'http://localhost:8000';

const DISORDER_KEYS = Object.keys(DISORDERS.en);

// Keyboard shortcut map: 1-9, 0 for keys 1..10, then n=none
const KEY_MAP = {};
DISORDER_KEYS.forEach((k, i) => {
  if (i < 9) KEY_MAP[String(i + 1)] = k;
  else if (i === 9) KEY_MAP['0'] = k;
});
KEY_MAP['n'] = 'none';

export default function BulkLabeling() {
  const [language, setLanguage] = useState('el');
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [labeled, setLabeled] = useState(0);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null); // { label, color }

  const load = useCallback((lang) => {
    setLoading(true);
    setIdx(0);
    setLabeled(0);
    training.getLabelingQueue(lang)
      .then(r => setItems(r.data.items || []))
      .catch(() => setError('Failed to load queue'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(language); }, [language, load]);

  const current = items[idx];

  const submit = useCallback(async (label) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await feedback.submit({ prediction_id: current.prediction_id, correct_label: label });
      setLabeled(l => l + 1);
      setFlash({ label, color: label === 'none' ? 'var(--success)' : 'var(--primary)' });
      setTimeout(() => setFlash(null), 700);
      setIdx(i => i + 1);
    } catch {
      setError('Submit failed');
    } finally {
      setSubmitting(false);
    }
  }, [current, submitting]);

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const label = KEY_MAP[e.key];
      if (label) { e.preventDefault(); submit(label); }
      if (e.key === 'ArrowRight' && idx < items.length - 1) setIdx(i => i + 1);
      if (e.key === 'ArrowLeft' && idx > 0) setIdx(i => i - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submit, idx, items.length]);

  const done = items.length > 0 && idx >= items.length;
  const progress = items.length > 0 ? (idx / items.length) * 100 : 0;

  return (
    <div className="layout">
      <Header />
      <div className="page-content" style={{ maxWidth: '800px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Link to="/training" className="btn btn-ghost btn-sm">← AI Model</Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: '700' }}>Bulk Labeling Tool</h1>
            <p className="text-muted text-sm">Label recordings quickly to bootstrap the ML model</p>
          </div>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '14px' }}
          >
            <option value="el">Greek</option>
            <option value="en">English</option>
          </select>
        </div>

        <div style={{ background: 'var(--primary-bg)', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: 'var(--primary)' }}>
          <strong>Keyboard shortcuts:</strong>&nbsp;
          {DISORDER_KEYS.map((k, i) => {
            const key = i < 9 ? String(i + 1) : i === 9 ? '0' : null;
            if (!key) return null;
            return <span key={k} style={{ marginRight: '10px' }}><kbd style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 5px', fontFamily: 'monospace' }}>{key}</kbd> {disorder(language, k)}</span>;
          })}
          &nbsp;&nbsp;
          <kbd style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 5px', fontFamily: 'monospace' }}>←→</kbd> navigate
        </div>

        {/* Progress */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span className="text-sm text-muted">
              {done ? 'Queue complete' : `${idx} / ${items.length} labeled this session`}
            </span>
            <span className="text-sm" style={{ fontWeight: '600', color: 'var(--success)' }}>
              {labeled} labeled today
            </span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: `${progress}%`, transition: 'width .3s ease' }} />
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

        {loading && (
          <div className="loading-screen"><div className="spinner" /></div>
        )}

        {!loading && items.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>No unlabeled recordings</h2>
            <p className="text-muted">All recordings for {language === 'el' ? 'Greek' : 'English'} have been labeled.</p>
          </div>
        )}

        {!loading && done && items.length > 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Queue finished!</h2>
            <p className="text-muted" style={{ marginBottom: '24px' }}>
              You labeled {labeled} recordings this session.
            </p>
            <Link to="/training" className="btn btn-primary">Go to Training Dashboard</Link>
          </div>
        )}

        {!loading && !done && current && (
          <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Flash overlay */}
            {flash && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                background: flash.color + '22',
                border: `3px solid ${flash.color}`,
                borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: '28px', fontWeight: '700', color: flash.color }}>
                  {disorder(language, flash.label)}
                </span>
              </div>
            )}

            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-0.5px' }}>{current.word}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  /{current.phoneme_target}/ · {current.position}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>AI said</div>
                <div style={{ fontWeight: '700', fontSize: '16px', marginTop: '2px' }}>
                  {disorder(language, current.disorder_type)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {current.confidence != null ? `${Math.round(current.confidence * 100)}% confidence` : ''}
                </div>
              </div>
            </div>

            {/* Audio + transcription */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>Recording</div>
                <audio
                  src={`${API_URL}${current.audio_url}`}
                  controls
                  style={{ width: '100%', height: '36px' }}
                />
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Transcription</div>
                <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: '600' }}>{current.transcription || '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>IPA: {current.ipa_produced || '—'}</div>
              </div>
            </div>

            {current.is_developmentally_appropriate && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#854d0e', marginBottom: '16px' }}>
                Developmentally appropriate for this age group
              </div>
            )}

            {/* Disorder buttons */}
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>
              What is the correct label?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {DISORDER_KEYS.map((k, i) => {
                const shortcut = i < 9 ? String(i + 1) : i === 9 ? '0' : null;
                const isAI = k === current.disorder_type;
                return (
                  <button
                    key={k}
                    onClick={() => submit(k)}
                    disabled={submitting}
                    style={{
                      padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                      cursor: 'pointer', border: '1.5px solid',
                      background: isAI ? 'var(--primary-bg)' : 'white',
                      color: isAI ? 'var(--primary)' : 'var(--text)',
                      borderColor: isAI ? 'var(--primary-lt)' : 'var(--border)',
                      transition: 'all .1s',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    {shortcut && (
                      <span style={{
                        background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: '4px', padding: '0 4px', fontFamily: 'monospace',
                        fontSize: '11px', color: 'var(--text-muted)',
                      }}>
                        {shortcut}
                      </span>
                    )}
                    {disorder(language, k)}
                    {isAI && <span style={{ fontSize: '10px', color: 'var(--primary)' }}>AI</span>}
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setIdx(i => i - 1)}
                disabled={idx === 0}
              >
                ← Previous
              </button>
              <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>
                {idx + 1} of {items.length}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setIdx(i => i + 1)}
                disabled={idx >= items.length - 1}
              >
                Skip →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
