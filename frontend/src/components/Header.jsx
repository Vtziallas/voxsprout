import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { therapist, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="header-brand">LogotherapyPro</div>
      <nav className="header-nav">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/training">AI Model</NavLink>
        <span className="text-sm" style={{ color: 'rgba(255,255,255,.6)', margin: '0 4px' }}>
          {therapist?.name}
        </span>
        <button onClick={handleLogout}>Logout</button>
      </nav>
    </header>
  );
}
