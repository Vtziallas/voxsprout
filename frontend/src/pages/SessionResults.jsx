import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Header from '../components/Header';
import { sessions, feedback } from '../api';
import { DISORDERS, t, disorder } from '../i18n';

const API_URL = 'http://localhost:8000';

function DisorderBadge({ type, lang }) {
  return (
    <span className={`badge badge-${type || 'unknown'}`}>
      {disorder(lang, type) || type || 'Unknown'}
    </span>
  );
}

function SummaryChart({ summary, lang }) {
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const colors = {
    omission: '#f59e0b', substitution: '#ec4899', distortion: '#8b5cf6',
    voicing_error: '#ef4444', fronting: '#10b981', backing: '#22c55e',
    gliding: '#3b82f6', cluster_reduction: '#f97316', final_consonant_deletion: '#a855f7',
    stopping: '#eab308',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Object.entries(summary).sort(([,a],[,b]) => b - a).map(([key, count]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '140px', fontSize: '13px', color: 'var(--text)', flexShrink: 0 }}>
            {disorder(lang, key)}
          </div>
          <div style={{ flex: 1, height: '10px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '99px',
              background: colors[key] || '#94a3b8',
              width: `${(count / total) * 100}%`,
              transition: 'width .5s ease',
            }} />
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', width: '24px', textAlign: 'right' }}>{count}</div>
        </div>
      ))}
    </div>
  );
}

function WordResultRow({ result, lang }) {
  const [feedbackLabel, setFeedbackLabel] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [loading, setLoading] = useState(false);

  const submitFeedback = async (label) => {
    setLoading(true);
    try {
      await feedback.submit({ prediction_id: result.prediction_id, correct_label: label });
      setFeedbackLabel(label);
      setShowFeedback(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', background: 'var(--bg)' }}>
        <div style={{ minWidth: '100px' }}>
          <div style={{ fontWeight: '700', fontSize: '16px' }}>{result.word}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>/{result.phoneme_target}/ · {result.position}</div>
        </div>
        <div style={{ flex: 1 }}>
          <DisorderBadge type={feedbackLabel || result.disorder_type} lang={lang} />
          {result.is_developmentally_appropriate && (
            <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', background: '#fef9c3', padding: '2px 8px', borderRadius: '4px' }}>
              {t(lang, 'ageAppropriateTag')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {result.audio_url && (
            <audio src={`${API_URL}${result.audio_url}`} controls style={{ height: '32px', width: '160px' }} />
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowFeedback(v => !v)}
          >
            {t(lang, 'correctBtn')}
          </button>
        </div>
      </div>

      {showFeedback && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'white' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            {t(lang, 'selectAssessment')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.keys(DISORDERS.en).map(k => (
              <button
                key={k}
                disabled={loading}
                onClick={() => submitFeedback(k)}
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', border: '1.5px solid var(--border)',
                  background: 'white', cursor: 'pointer', transition: 'all .15s',
                }}
                onMouseEnter={e => { e.target.style.background = 'var(--primary-bg)'; e.target.style.borderColor = 'var(--primary-lt)'; }}
                onMouseLeave={e => { e.target.style.background = 'white'; e.target.style.borderColor = 'var(--border)'; }}
              >
                {disorder(lang, k)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '10px 18px', display: 'flex', gap: '24px', background: 'white', borderTop: '1px solid var(--border)' }}>
        <div>
          <span className="text-sm text-muted">{t(lang, 'transcription')}: </span>
          <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{result.transcription || '—'}</span>
        </div>
        <div>
          <span className="text-sm text-muted">{t(lang, 'ipaProduced')}: </span>
          <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{result.ipa_produced || '—'}</span>
        </div>
        {result.confidence != null && (
          <div>
            <span className="text-sm text-muted">{t(lang, 'confidence')}: </span>
            <span style={{ fontSize: '13px', fontWeight: '600' }}>{Math.round(result.confidence * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SessionResults() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sessions.getResults(id).then(r => setData(r.data)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="layout"><Header />
      <div className="loading-screen"><div className="spinner" /></div>
    </div>
  );

  const lang = data?.language || 'en';
  const disorders = Object.entries(data?.summary || {}).filter(([k]) => k !== 'none');
  const hasDisorders = disorders.length > 0;

  return (
    <div className="layout">
      <Header />
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <Link to="/" className="btn btn-ghost btn-sm">← Dashboard</Link>
          <Link to={`/sessions/${id}/analysis`} className="btn btn-outline btn-sm">Acoustic Analysis</Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: '700' }}>
              {t(lang, 'assessment')} — {data?.patient_name}
            </h1>
            <p className="text-muted text-sm">
              {lang === 'el' ? t(lang, 'greekLabel') : t(lang, 'englishLabel')}
              {data?.patient_age_months && ` · ${t(lang, 'ageFormat', Math.floor(data.patient_age_months / 12), data.patient_age_months % 12)}`}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: '16px' }}>{t(lang, 'summaryTitle')}</div>
            {!hasDisorders ? (
              <div style={{ color: 'var(--success)', fontWeight: '600', fontSize: '15px' }}>
                {t(lang, 'noDisordersFound')}
              </div>
            ) : (
              <SummaryChart summary={data.summary} lang={lang} />
            )}
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: '16px' }}>{t(lang, 'overviewTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">{t(lang, 'wordsAssessed')}</span>
                <span style={{ fontWeight: '600' }}>{data?.results?.length || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">{t(lang, 'disordersDetected')}</span>
                <span style={{ fontWeight: '600' }}>
                  {data?.results?.filter(r => r.disorder_type && r.disorder_type !== 'none').length || 0}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">{t(lang, 'ageAppropriate')}</span>
                <span style={{ fontWeight: '600' }}>
                  {data?.results?.filter(r => r.is_developmentally_appropriate).length || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t(lang, 'wordResults')}</div>
            <span className="text-sm text-muted">{t(lang, 'clickToCorrect')}</span>
          </div>
          {data?.results?.map(result => (
            <WordResultRow key={result.recording_id} result={result} lang={lang} />
          ))}
        </div>
      </div>
    </div>
  );
}
