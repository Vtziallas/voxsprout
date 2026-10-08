import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { patients, sessions } from '../api';

const DISORDER_LABELS = {
  none: 'No disorder', omission: 'Omission', substitution: 'Substitution',
  distortion: 'Distortion', voicing_error: 'Voicing Error', fronting: 'Fronting',
  backing: 'Backing', gliding: 'Gliding', cluster_reduction: 'Cluster Reduction',
  final_consonant_deletion: 'Final Deletion', stopping: 'Stopping',
};

function StatusBadge({ status }) {
  const colors = {
    pending:    { bg: '#fef9c3', color: '#854d0e' },
    processing: { bg: '#eff6ff', color: '#1e40af' },
    completed:  { bg: '#f0fdf4', color: '#16a34a' },
    failed:     { bg: '#fef2f2', color: '#dc2626' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span style={{ ...c, padding: '2px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: '600' }}>
      {status}
    </span>
  );
}

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [sessionList, setSessionList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([patients.get(id), sessions.listForPatient(id)])
      .then(([pRes, sRes]) => { setPatient(pRes.data); setSessionList(sRes.data); })
      .finally(() => setLoading(false));
  }, [id]);

  const startNew = async () => {
    const res = await sessions.create({ patient_id: parseInt(id), language: patient.language });
    navigate(`/sessions/new?sessionId=${res.data.id}&patientId=${id}&language=${patient.language}`);
  };

  if (loading) return (
    <div className="layout"><Header />
      <div className="loading-screen"><div className="spinner" /></div>
    </div>
  );

  return (
    <div className="layout">
      <Header />
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <Link to="/" className="btn btn-ghost btn-sm">← Back</Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: '700' }}>{patient?.name}</h1>
            <p className="text-muted text-sm">
              {patient?.language === 'el' ? 'Greek' : 'English'} assessment
              {patient?.date_of_birth && ` · DOB ${patient.date_of_birth}`}
            </p>
          </div>
          <button className="btn btn-primary" onClick={startNew}>+ New Assessment</button>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Assessment History</div>
            <span className="text-sm text-muted">{sessionList.length} session{sessionList.length !== 1 ? 's' : ''}</span>
          </div>

          {sessionList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>No sessions yet</h3>
              <p>Start the first assessment for this patient.</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessionList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(s => (
                  <tr key={s.id}>
                    <td>{new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>{s.language === 'el' ? 'Greek' : 'English'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      {s.status === 'completed' ? (
                        <Link to={`/sessions/${s.id}/results`} className="btn btn-outline btn-sm">View Results</Link>
                      ) : (
                        <Link
                          to={`/sessions/new?sessionId=${s.id}&patientId=${id}&language=${s.language}`}
                          className="btn btn-primary btn-sm"
                        >
                          Continue
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
