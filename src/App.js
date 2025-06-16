import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import DrawingPage from './DrawingPage';
import GalleryPage from './GalleryPage';

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', background: '#f5f5f7' }}>
        <nav style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#fff',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          borderRadius: 16,
          margin: '32px auto 0',
          width: 'fit-content',
          padding: '12px 48px',
        }}>
          <Link to="/" style={{ marginRight: 32, fontWeight: 600, fontSize: 20, color: '#222', textDecoration: 'none', letterSpacing: -0.5 }}>Draw</Link>
          <Link to="/gallery" style={{ fontWeight: 600, fontSize: 20, color: '#222', textDecoration: 'none', letterSpacing: -0.5 }}>Gallery</Link>
        </nav>
        <Routes>
          <Route path="/" element={<DrawingPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
