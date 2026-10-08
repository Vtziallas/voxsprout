import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { sessions, feedback } from '../api';
import { DISORDERS, t, disorder } from '../i18n';

const API_URL = 'http://localhost:8000';

const ALL_DISORDERS = Object.keys(DISORDERS.en);

function WordImage({ filename, word }) {
  const [imgError, setImgError] = useState(false);
  if (imgError || !filename) {
    return (
      <div style={{
        width: '260px', height: '200px', border: '2px dashed var(--border)',
        borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', flexDirection: 'column', gap: '8px',
      }}>
        <span style={{ fontSize: '48px' }}>🖼</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Image coming soon</span>
      </div>
    );
  }
  return (
    <img
      src={`${API_URL}/images/${filename}`}
      alt={word}
      onError={() => setImgError(true)}
      style={{ width: '260px', height: '200px', objectFit: 'contain', borderRadius: '12px', border: '1px solid var(--border)', background: 'white' }}
    />
  );
}

function FeedbackPanel({ result, lang, onSubmit }) {
  const [selected, setSelected] = useState(result.disorder_type || 'none');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (label) => {
    setSelected(label);
    setLoading(true);
    try {
      await feedback.submit({ prediction_id: result.prediction_id, correct_label: label });
      setSubmitted(true);
      onSubmit(label);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--success)' }}>
        {t(lang, 'feedbackSaved')}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
        {t(lang, 'correctAssessmentPrompt')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {ALL_DISORDERS.map(d => (
          <button
            key={d}
            onClick={() => submit(d)}
            disabled={loading}
            style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
              cursor: 'pointer', border: '1.5px solid',
              background: selected === d ? 'var(--primary-lt)' : 'white',
              color: selected === d ? 'white' : 'var(--text)',
              borderColor: selected === d ? 'var(--primary-lt)' : 'var(--border)',
              transition: 'all .15s',
            }}
          >
            {disorder(lang, d)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({ result, lang, onFeedback }) {
  const disorderColor = {
    none: 'var(--success)', omission: '#92400e', substitution: '#9d174d',
    distortion: '#5b21b6', voicing_error: 'var(--error)', fronting: '#065f46',
    backing: '#166534', gliding: 'var(--primary)', cluster_reduction: '#c2410c',
    final_consonant_deletion: '#7e22ce', stopping: '#854d0e',
  };

  const dtype = result.disorder_type || 'unknown';
  const color = disorderColor[dtype] || 'var(--text-muted)';

  return (
    <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t(lang, 'aiAssessment')}</span>
          <div style={{ fontSize: '18px', fontWeight: '700', color, marginTop: '2px' }}>
            {disorder(lang, dtype)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t(lang, 'confidence')}</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>
            {result.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'}
          </div>
        </div>
      </div>

      {result.is_developmentally_appropriate && (
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#854d0e' }}>
          {t(lang, 'developmentalNote')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ background: 'var(--bg)', borderRadius: '6px', padding: '10px 12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t(lang, 'targetPhoneme')}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: '600', marginTop: '2px' }}>/{result.phoneme_target}/</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{result.position}</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: '6px', padding: '10px 12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t(lang, 'transcription')}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: '600', marginTop: '2px' }}>
            {result.transcription || '—'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            IPA: {result.ipa_produced || '—'}
          </div>
        </div>
      </div>

      <FeedbackPanel result={result} lang={lang} onSubmit={onFeedback} />
    </div>
  );
}

export default function NewSession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('sessionId');
  const language  = searchParams.get('language') || 'el';

  const [words, setWords] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState({});   // wordId -> result
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);

  useEffect(() => {
    sessions.getWords(language)
      .then(res => setWords(res.data.words || []))
      .catch(() => setError(t(language, 'loadFailed')));
  }, [language]);

  const currentWord = words[currentIdx];
  const done = words.length > 0 && Object.keys(results).length === words.length;

  const startRecording = async () => {
    setError('');
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(100);
      setRecording(true);
    } catch {
      setError(t(language, 'micDenied'));
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType || 'audio/webm' });
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      await uploadAudio(blob);
    };
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const uploadAudio = async (blob) => {
    setProcessing(true);
    try {
      const res = await sessions.record(sessionId, currentWord.id, blob);
      setResults(r => ({ ...r, [currentWord.id]: { ...res.data, phoneme_target: currentWord.phoneme_target, position: currentWord.position } }));
    } catch (err) {
      setError(err.response?.data?.detail || t(language, 'uploadFailed'));
    } finally {
      setProcessing(false);
    }
  };

  const completeSession = async () => {
    setCompleting(true);
    try {
      await sessions.complete(sessionId);
      navigate(`/sessions/${sessionId}/results`);
    } catch {
      setCompleting(false);
    }
  };

  if (words.length === 0 && !error) {
    return (
      <div className="layout"><Header />
        <div className="loading-screen"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="layout">
      <Header />
      <div className="page-content" style={{ maxWidth: '720px' }}>

        {/* Progress */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontWeight: '600', fontSize: '15px' }}>
              {t(language, 'assessment')} — {language === 'el' ? t(language, 'greekLabel') : t(language, 'englishLabel')}
            </span>
            <span className="text-sm text-muted">
              {t(language, 'wordsOf', Object.keys(results).length, words.length)}
            </span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: `${(Object.keys(results).length / Math.max(words.length, 1)) * 100}%` }} />
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {!done && currentWord && (
          <div className="card" style={{ marginBottom: '20px' }}>
            {/* Word navigation tabs */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              {words.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => !recording && !processing && setCurrentIdx(i)}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', border: '1px solid',
                    fontSize: '12px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: i === currentIdx ? 'var(--primary-lt)' : results[w.id] ? 'var(--success-bg)' : 'white',
                    color: i === currentIdx ? 'white' : results[w.id] ? 'var(--success)' : 'var(--text-muted)',
                    borderColor: i === currentIdx ? 'var(--primary-lt)' : results[w.id] ? '#bbf7d0' : 'var(--border)',
                  }}
                >
                  {w.word}
                </button>
              ))}
            </div>

            {/* Main recording area */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <WordImage filename={currentWord.image_filename} word={currentWord.word} />

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: '700', letterSpacing: '-0.5px' }}>
                  {currentWord.word}
                </div>
                {currentWord.translation && (
                  <div className="text-muted text-sm" style={{ marginTop: '2px' }}>({currentWord.translation})</div>
                )}
                <div style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                  target: /{currentWord.phoneme_target}/ · {currentWord.position}
                </div>
              </div>

              {processing ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div className="spinner" />
                  <span className="text-sm text-muted">{t(language, 'analyzing')}</span>
                </div>
              ) : results[currentWord.id] ? (
                <div style={{ width: '100%' }}>
                  <ResultPanel
                    result={results[currentWord.id]}
                    lang={language}
                    onFeedback={(label) => setResults(r => ({ ...r, [currentWord.id]: { ...r[currentWord.id], feedback: label } }))}
                  />
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                    {currentIdx < words.length - 1 && (
                      <button className="btn btn-primary" onClick={() => setCurrentIdx(i => i + 1)}>
                        {t(language, 'nextWord')}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <button
                    className={`btn-record ${recording ? 'recording' : ''}`}
                    onClick={recording ? stopRecording : startRecording}
                  >
                    <span style={{ fontSize: '22px' }}>{recording ? '⏹' : '🎙'}</span>
                    <span>{recording ? t(language, 'stop') : t(language, 'record')}</span>
                  </button>
                  {recording && (
                    <span style={{ color: 'var(--error)', fontSize: '13px', fontWeight: '500', animation: 'pulse-record 1.2s infinite' }}>
                      {t(language, 'recording')}
                    </span>
                  )}
                  {!recording && (
                    <span className="text-sm text-muted">{t(language, 'pressRecord')}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* All done */}
        {done && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>{t(language, 'assessmentComplete')}</h2>
            <p className="text-muted" style={{ marginBottom: '24px' }}>
              {t(language, 'allRecorded', words.length)}
            </p>
            <button className="btn btn-primary btn-lg" onClick={completeSession} disabled={completing}>
              {completing ? t(language, 'saving') : t(language, 'viewReport')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
