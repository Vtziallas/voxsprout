import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Header from '../components/Header';
import { sessions } from '../api';
import { disorder } from '../i18n';

const API_URL = 'http://localhost:8000';

// ── FFT utilities (Cooley-Tukey radix-2, in-place) ────────────────────────────
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0;
      for (let j = 0; j < len >> 1; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + (len >> 1)] * cRe - im[i + j + (len >> 1)] * cIm;
        const vIm = re[i + j + (len >> 1)] * cIm + im[i + j + (len >> 1)] * cRe;
        re[i + j] = uRe + vRe;  im[i + j] = uIm + vIm;
        re[i + j + (len >> 1)] = uRe - vRe;  im[i + j + (len >> 1)] = uIm - vIm;
        const nr = cRe * wRe - cIm * wIm;  cIm = cRe * wIm + cIm * wRe;  cRe = nr;
      }
    }
  }
}

function computeSpectrogram(audioData, fftSize = 512, hopSize = 128) {
  const numFrames = Math.floor((audioData.length - fftSize) / hopSize) + 1;
  const numFreqs = fftSize >> 1;
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++)
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));

  const out = new Float32Array(numFrames * numFreqs);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    for (let i = 0; i < fftSize; i++) { re[i] = (audioData[start + i] || 0) * hann[i]; im[i] = 0; }
    fft(re, im);
    for (let i = 0; i < numFreqs; i++) {
      const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      out[f * numFreqs + i] = 20 * Math.log10(mag + 1e-9);
    }
  }
  return { data: out, numFrames, numFreqs };
}

// Viridis-like colormap: dark purple → blue → teal → green → yellow
function specColor(t) {
  const stops = [
    [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
  ];
  const pos = t * (stops.length - 1);
  const lo = Math.min(Math.floor(pos), stops.length - 2);
  const frac = pos - lo;
  return stops[lo].map((v, i) => Math.round(v + frac * (stops[lo + 1][i] - v)));
}

// ── Spectrogram canvas ────────────────────────────────────────────────────────
function SpectrogramCanvas({ audioUrl }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | done | error

  useEffect(() => {
    if (!audioUrl || !canvasRef.current) return;
    setStatus('loading');

    fetch(`${API_URL}${audioUrl}`)
      .then(r => r.arrayBuffer())
      .then(buf => new AudioContext().decodeAudioData(buf))
      .then(decoded => {
        const audioData = decoded.getChannelData(0);
        const FFT_SIZE = 512, HOP = 128;
        const spec = computeSpectrogram(audioData, FFT_SIZE, HOP);

        // dB range — clamp to speech-relevant range
        let lo = 0, hi = -Infinity;
        for (let i = 0; i < spec.data.length; i++) if (spec.data[i] > hi) hi = spec.data[i];
        lo = hi - 60; // 60 dB dynamic range

        const canvas = canvasRef.current;
        const W = canvas.width, H = canvas.height;
        const img = new ImageData(W, H);

        for (let x = 0; x < W; x++) {
          const fi = Math.floor((x / W) * spec.numFrames);
          for (let y = 0; y < H; y++) {
            // y=0 is top → high freq; y=H is bottom → low freq
            const qi = Math.floor(((H - 1 - y) / H) * spec.numFreqs);
            const db = spec.data[fi * spec.numFreqs + qi];
            const t = Math.max(0, Math.min(1, (db - lo) / (hi - lo)));
            const [r, g, b] = specColor(t);
            const idx = (y * W + x) * 4;
            img.data[idx] = r; img.data[idx + 1] = g;
            img.data[idx + 2] = b; img.data[idx + 3] = 255;
          }
        }
        canvas.getContext('2d').putImageData(img, 0, 0);

        // Frequency axis labels (right side overlay — drawn after putImageData)
        const ctx2 = canvas.getContext('2d');
        ctx2.font = '10px monospace';
        ctx2.fillStyle = 'rgba(255,255,255,0.75)';
        const sr = decoded.sampleRate;
        const maxFreq = sr / 2;
        [8000, 4000, 2000, 1000, 500].forEach(hz => {
          if (hz > maxFreq) return;
          const y = H - (hz / maxFreq) * H;
          ctx2.fillText(`${hz >= 1000 ? hz / 1000 + 'k' : hz} Hz`, 4, y + 4);
          ctx2.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx2.beginPath(); ctx2.moveTo(0, y); ctx2.lineTo(W, y); ctx2.stroke();
        });

        setStatus('done');
      })
      .catch(() => setStatus('error'));
  }, [audioUrl]);

  return (
    <div style={{ position: 'relative' }}>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0f172a', borderRadius: '8px',
        }}>
          <div className="spinner" style={{ borderColor: '#334155', borderTopColor: '#3b82f6' }} />
        </div>
      )}
      {status === 'error' && (
        <div style={{
          height: '160px', background: '#0f172a', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: '#64748b', fontSize: '13px' }}>Spectrogram unavailable</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={900}
        height={160}
        style={{
          width: '100%', height: '160px', borderRadius: '8px', display: 'block',
          background: '#0f172a', opacity: status === 'done' ? 1 : 0,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>0 s</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>time →</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>frequency ↑ (Hz)</span>
      </div>
      {/* Colorbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>low energy</span>
        <div style={{
          flex: 1, height: '8px', borderRadius: '4px',
          background: 'linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)',
        }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>high energy</span>
      </div>
    </div>
  );
}

// ── Waveform drawn from audio buffer via Web Audio API ────────────────────────
function WaveformCanvas({ audioUrl }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!audioUrl || !canvasRef.current) return;
    setError(false);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    fetch(`${API_URL}${audioUrl}`)
      .then(r => r.arrayBuffer())
      .then(buf => new AudioContext().decodeAudioData(buf))
      .then(decoded => {
        const data = decoded.getChannelData(0);
        const W = canvas.width;
        const H = canvas.height;
        const step = Math.ceil(data.length / W);

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);

        // Center line
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();

        // Waveform
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < W; i++) {
          let min = 0, max = 0;
          for (let j = 0; j < step; j++) {
            const v = data[i * step + j] || 0;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          ctx.moveTo(i, (1 + min) * H / 2);
          ctx.lineTo(i, (1 + max) * H / 2);
        }
        ctx.stroke();
      })
      .catch(() => setError(true));
  }, [audioUrl]);

  if (error) return (
    <div style={{ height: '80px', background: 'var(--bg)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="text-muted text-sm">Waveform unavailable</span>
    </div>
  );

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={80}
      style={{ width: '100%', height: '80px', borderRadius: '8px', display: 'block' }}
    />
  );
}

// ── MFCC bar chart (SVG) ──────────────────────────────────────────────────────
function MFCCChart({ means, stds }) {
  if (!means || means.length === 0) return <div className="text-muted text-sm">No MFCC data</div>;

  const count = means.length;
  const barW = 22;
  const gap = 5;
  const H = 130;
  const totalW = count * (barW + gap);
  const maxAbs = Math.max(...means.map(Math.abs), 1);
  const midY = 60;

  return (
    <svg viewBox={`0 0 ${totalW} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
      <line x1={0} y1={midY} x2={totalW} y2={midY} stroke="#e2e8f0" strokeWidth={1} />
      {means.map((v, i) => {
        const barH = (Math.abs(v) / maxAbs) * 50;
        const x = i * (barW + gap);
        const y = v >= 0 ? midY - barH : midY;
        const std = stds?.[i];
        const errH = std ? (std / maxAbs) * 50 : 0;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)}
              fill={v >= 0 ? '#3b82f6' : '#f97316'} rx={2} opacity={0.85} />
            {std != null && (
              <line
                x1={x + barW / 2} x2={x + barW / 2}
                y1={y - errH} y2={y + errH}
                stroke="#64748b" strokeWidth={1.5}
              />
            )}
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {i + 1}
            </text>
            <title>C{i + 1}: {v.toFixed(2)}{std != null ? ` ±${std.toFixed(2)}` : ''}</title>
          </g>
        );
      })}
      <text x={0} y={H - 4} fontSize="9" fill="#94a3b8">MFCC</text>
    </svg>
  );
}

// ── Horizontal bar for a single value with a reference range ─────────────────
function RangeBar({ value, min, max, color, label, unit }) {
  if (value == null) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '110px', fontSize: '12px', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ flex: 1, height: '8px', background: 'var(--bg)', borderRadius: '99px' }} />
      <div style={{ width: '70px', fontSize: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>—</div>
    </div>
  );
  const clamped = Math.max(min, Math.min(max, value));
  const pct = ((clamped - min) / (max - min)) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '110px', fontSize: '12px', color: 'var(--text)' }}>{label}</div>
      <div style={{ flex: 1, height: '8px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '99px', transition: 'width .4s ease' }} />
      </div>
      <div style={{ width: '70px', fontSize: '12px', fontWeight: '600', textAlign: 'right' }}>
        {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(3)) : value}
        {unit && <span style={{ fontWeight: '400', color: 'var(--text-muted)', marginLeft: '3px' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── Formant vowel space (F1 vs F2) ────────────────────────────────────────────
function FormantPlot({ formants }) {
  const { f1, f2 } = formants || {};
  if (!f1 || !f2) return <div className="text-muted text-sm" style={{ padding: '20px 0' }}>No formant data</div>;

  // Typical vowel space: F1 200–900 Hz (y-axis inverted), F2 700–2800 Hz
  const F1_MIN = 200, F1_MAX = 1000;
  const F2_MIN = 600, F2_MAX = 3000;
  const W = 200, H = 140;

  const px = ((f2 - F2_MIN) / (F2_MAX - F2_MIN)) * W;
  const py = ((f1 - F1_MIN) / (F1_MAX - F1_MIN)) * H; // not inverted for simplicity

  // Reference vowel positions (approximate)
  const vowels = [
    { label: 'i', f1: 280, f2: 2600 }, { label: 'e', f1: 400, f2: 2200 },
    { label: 'a', f1: 750, f2: 1200 }, { label: 'o', f1: 450, f2: 800 },
    { label: 'u', f1: 300, f2: 700 },
  ];

  return (
    <svg viewBox={`0 0 ${W + 40} ${H + 30}`} style={{ width: '100%', maxWidth: '260px' }}>
      {/* Axes */}
      <line x1={30} y1={0} x2={30} y2={H} stroke="#e2e8f0" />
      <line x1={30} y1={H} x2={W + 30} y2={H} stroke="#e2e8f0" />
      <text x={0} y={H / 2} fontSize="9" fill="#94a3b8" transform={`rotate(-90,8,${H/2})`}>F1 (Hz)</text>
      <text x={W / 2 + 30} y={H + 28} textAnchor="middle" fontSize="9" fill="#94a3b8">F2 (Hz)</text>
      {/* Axis labels */}
      <text x={30} y={H + 12} fontSize="8" fill="#94a3b8" textAnchor="middle">{F2_MIN}</text>
      <text x={W + 30} y={H + 12} fontSize="8" fill="#94a3b8" textAnchor="middle">{F2_MAX}</text>

      {/* Reference vowels */}
      {vowels.map(v => {
        const vx = 30 + ((v.f2 - F2_MIN) / (F2_MAX - F2_MIN)) * W;
        const vy = ((v.f1 - F1_MIN) / (F1_MAX - F1_MIN)) * H;
        return (
          <g key={v.label}>
            <circle cx={vx} cy={vy} r={8} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1} />
            <text x={vx} y={vy + 4} textAnchor="middle" fontSize="9" fill="#64748b">{v.label}</text>
          </g>
        );
      })}

      {/* Measured point */}
      <circle cx={30 + Math.max(0, Math.min(W, px))} cy={Math.max(0, Math.min(H, py))} r={6} fill="#3b82f6" opacity={0.9} />
      <text x={30 + Math.max(0, Math.min(W, px)) + 8} y={Math.max(8, Math.min(H, py)) + 4} fontSize="9" fill="#3b82f6" fontWeight="bold">X</text>
    </svg>
  );
}

// ── Cross-session spectral centroid comparison ────────────────────────────────
function SpectralOverview({ recordings, lang }) {
  const maxSC = Math.max(...recordings.map(r => r.features?.spectral_centroid_mean || 0), 100);
  const disorderColors = {
    none: '#22c55e', omission: '#f59e0b', substitution: '#ec4899',
    distortion: '#8b5cf6', voicing_error: '#ef4444', fronting: '#10b981',
    backing: '#22c55e', gliding: '#3b82f6', cluster_reduction: '#f97316',
    final_consonant_deletion: '#a855f7', stopping: '#eab308',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {recordings.map(r => {
        const sc = r.features?.spectral_centroid_mean;
        const pct = sc ? Math.min(100, (sc / 8000) * 100) : 0;
        const color = disorderColors[r.disorder_type] || '#94a3b8';
        return (
          <div key={r.word_id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '90px', fontSize: '13px', fontWeight: '600' }}>{r.word}</div>
            <div style={{ width: '80px', fontSize: '11px', color: 'var(--text-muted)' }}>
              /{r.phoneme_target}/
            </div>
            <div style={{ flex: 1, height: '14px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '99px', transition: 'width .5s ease' }} />
            </div>
            <div style={{ width: '65px', fontSize: '12px', fontWeight: '600', textAlign: 'right' }}>
              {sc ? `${Math.round(sc)} Hz` : '—'}
            </div>
            <div style={{ width: '110px', fontSize: '11px', color }}>
              {disorder(lang, r.disorder_type)}
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>0 Hz</span>
        <div style={{ flex: 1, borderTop: '1px dashed var(--border)', alignSelf: 'center' }} />
        <span>8000 Hz</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AcousticAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    sessions.getFeatures(id)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="layout"><Header />
      <div className="loading-screen"><div className="spinner" /></div>
    </div>
  );

  if (!data) return (
    <div className="layout"><Header />
      <div className="page-content"><div className="alert alert-error">Failed to load analysis data.</div></div>
    </div>
  );

  const { recordings, language: lang } = data;
  const rec = recordings[selected];
  const feat = rec?.features;

  return (
    <div className="layout">
      <Header />
      <div className="page-content" style={{ maxWidth: '960px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <Link to={`/sessions/${id}/results`} className="btn btn-ghost btn-sm">← Results</Link>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700' }}>Acoustic Analysis</h1>
            <p className="text-muted text-sm">Full feature breakdown per recording</p>
          </div>
        </div>

        {/* Spectral centroid overview (all words) */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-title" style={{ marginBottom: '16px' }}>Spectral Centroid — All Words</div>
          <SpectralOverview recordings={recordings} lang={lang} />
        </div>

        {/* Word selector */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '20px' }}>
          {recordings.map((r, i) => (
            <button
              key={r.word_id}
              onClick={() => setSelected(i)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: '1.5px solid', fontSize: '13px',
                fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                background: i === selected ? 'var(--primary-lt)' : 'white',
                color: i === selected ? 'white' : 'var(--text)',
                borderColor: i === selected ? 'var(--primary-lt)' : 'var(--border)',
              }}
            >
              {r.word}
              <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.75 }}>/{r.phoneme_target}/</span>
            </button>
          ))}
        </div>

        {rec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Audio + waveform */}
            <div className="card">
              <div className="card-header" style={{ marginBottom: '12px' }}>
                <div>
                  <div className="card-title">{rec.word}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>
                    /{rec.phoneme_target}/ · {rec.position}
                    {rec.transcription && <span> · ASR: "{rec.transcription}"</span>}
                    {rec.ipa_produced && <span> · IPA: {rec.ipa_produced}</span>}
                  </div>
                </div>
                <span className={`badge badge-${rec.disorder_type || 'unknown'}`}>
                  {disorder(lang, rec.disorder_type)}
                </span>
              </div>
              <WaveformCanvas audioUrl={rec.audio_url} />
              <audio
                src={`${API_URL}${rec.audio_url}`}
                controls
                style={{ width: '100%', marginTop: '10px', height: '36px' }}
              />
            </div>

            {feat ? (
              <>
                {/* Spectrogram */}
                <div className="card">
                  <div className="card-title" style={{ marginBottom: '4px' }}>Spectrogram</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Time (x) × Frequency (y) × Energy (color). Fricatives = broadband noise. Vowels = horizontal formant bands. Stops = vertical bursts.
                  </div>
                  <SpectrogramCanvas audioUrl={rec.audio_url} />
                </div>

                {/* MFCC chart */}
                <div className="card">
                  <div className="card-title" style={{ marginBottom: '4px' }}>MFCC Coefficients (C1–C13)</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Blue = positive, orange = negative. Error bars show standard deviation over time.
                  </div>
                  <MFCCChart means={feat.mfcc_means} stds={feat.mfcc_stds} />
                </div>

                {/* Formants + Spectral */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: '12px' }}>Formants — Vowel Space</div>
                    <FormantPlot formants={feat.formants} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      {[
                        { label: 'F1 (height)', value: feat.formants?.f1, min: 200, max: 1000, color: '#3b82f6', unit: 'Hz' },
                        { label: 'F2 (frontness)', value: feat.formants?.f2, min: 600, max: 3000, color: '#8b5cf6', unit: 'Hz' },
                        { label: 'F3', value: feat.formants?.f3, min: 1500, max: 3500, color: '#06b6d4', unit: 'Hz' },
                      ].map(p => <RangeBar key={p.label} {...p} />)}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title" style={{ marginBottom: '12px' }}>Spectral Features</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <RangeBar label="Spectral centroid" value={feat.spectral_centroid_mean} min={0} max={8000} color="#f59e0b" unit="Hz" />
                      <RangeBar label="Zero crossing rate" value={feat.zcr_mean} min={0} max={0.5} color="#10b981" />
                      <RangeBar label="Energy (RMS)" value={feat.energy} min={0} max={0.5} color="#ec4899" />
                      <RangeBar label="Duration" value={feat.duration} min={0} max={3} color="#64748b" unit="s" />
                    </div>
                  </div>
                </div>

                {/* Voice quality */}
                <div className="card">
                  <div className="card-title" style={{ marginBottom: '4px' }}>Voice Quality (Praat)</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Jitter &amp; shimmer measure vocal fold irregularity. HNR measures clarity (higher = cleaner voice).
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <RangeBar label="Pitch mean" value={feat.pitch_mean} min={50} max={400} color="#3b82f6" unit="Hz" />
                      <RangeBar label="Pitch std" value={feat.pitch_std} min={0} max={100} color="#6366f1" unit="Hz" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <RangeBar label="Jitter" value={feat.jitter} min={0} max={0.05} color="#ef4444" />
                      <RangeBar label="Shimmer" value={feat.shimmer} min={0} max={0.3} color="#f97316" />
                      <RangeBar label="HNR" value={feat.hnr} min={0} max={30} color="#22c55e" unit="dB" />
                    </div>
                  </div>
                </div>

                {/* Raw values table */}
                <div className="card">
                  <div className="card-title" style={{ marginBottom: '12px' }}>Raw Feature Values</div>
                  <table className="table">
                    <thead>
                      <tr><th>Feature</th><th>Value</th><th>Feature</th><th>Value</th></tr>
                    </thead>
                    <tbody>
                      {[
                        ['Spectral centroid', feat.spectral_centroid_mean != null ? `${Math.round(feat.spectral_centroid_mean)} Hz` : '—',
                         'Duration', feat.duration != null ? `${feat.duration.toFixed(3)} s` : '—'],
                        ['F1', feat.formants?.f1 != null ? `${Math.round(feat.formants.f1)} Hz` : '—',
                         'F2', feat.formants?.f2 != null ? `${Math.round(feat.formants.f2)} Hz` : '—'],
                        ['F3', feat.formants?.f3 != null ? `${Math.round(feat.formants.f3)} Hz` : '—',
                         'Pitch mean', feat.pitch_mean != null ? `${Math.round(feat.pitch_mean)} Hz` : '—'],
                        ['Pitch std', feat.pitch_std != null ? `${feat.pitch_std.toFixed(1)} Hz` : '—',
                         'ZCR', feat.zcr_mean != null ? feat.zcr_mean.toFixed(4) : '—'],
                        ['Energy', feat.energy != null ? feat.energy.toFixed(4) : '—',
                         'HNR', feat.hnr != null ? `${feat.hnr.toFixed(2)} dB` : '—'],
                        ['Jitter', feat.jitter != null ? feat.jitter.toFixed(5) : '—',
                         'Shimmer', feat.shimmer != null ? feat.shimmer.toFixed(4) : '—'],
                        ['Is silent', feat.is_silent ? 'Yes' : 'No',
                         'MFCC C1', feat.mfcc_means?.[0] != null ? feat.mfcc_means[0].toFixed(2) : '—'],
                      ].map((row, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row[0]}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: '600', fontSize: '13px' }}>{row[1]}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row[2]}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: '600', fontSize: '13px' }}>{row[3]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px' }}>
                No acoustic features recorded for this word.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
