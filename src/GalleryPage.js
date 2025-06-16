import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHeart } from 'react-icons/fa';

const API_URL = 'http://localhost:5050';

const GalleryPage = () => {
    const [images, setImages] = useState([]);
    const [selected, setSelected] = useState(null);
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetch(`${API_URL}/api/published`)
            .then(res => res.json())
            .then(data => setImages(data))
            .catch(() => setImages([]));
    }, []);

    const getLikes = (filename) => Number(localStorage.getItem('like_' + filename) || 0);
    const setLikes = (filename, val) => localStorage.setItem('like_' + filename, val);

    const handleImageClick = (img) => {
        setSelected(img);
    };

    const handleImport = () => {
        if (selected) {
            // Save selected image info to localStorage for DrawingPage to import
            localStorage.setItem('importedImage', JSON.stringify(selected));
            navigate('/');
        }
    };

    const handleLike = (img) => {
        const current = getLikes(img.filename);
        setLikes(img.filename, current + 1);
        setImages(images => images.map(i => i.filename === img.filename ? { ...i } : i)); // force re-render
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
            <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.08)', padding: 32, marginTop: 32 }}>
                <h1 style={{ textAlign: 'center', fontWeight: 700, fontSize: 36, letterSpacing: -1, color: '#222' }}>Gallery</h1>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '32px 0 16px 0' }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <button style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#eee', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Sort by: Relevant</button>
                        <button style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#eee', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Sort by: Likes</button>
                        <button style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#eee', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Sort by: Date</button>
                    </div>
                    <input type="text" placeholder="Search..." style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc', fontSize: 16, width: 200 }} />
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 16,
                    marginTop: 32,
                }}>
                    {images.map((img, idx) => (
                        <div
                            key={img.filename}
                            style={{
                                border: '1px solid #ccc',
                                borderRadius: 8,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                background: '#fff',
                                boxShadow: hoveredIdx === idx ? '0 6px 24px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.07)',
                                position: 'relative',
                                transform: hoveredIdx === idx ? 'scale(1.06)' : 'scale(1)',
                                transition: 'box-shadow 0.2s, transform 0.2s',
                                zIndex: hoveredIdx === idx ? 2 : 1,
                            }}
                            onClick={() => handleImageClick(img)}
                            onMouseEnter={() => setHoveredIdx(idx)}
                            onMouseLeave={() => setHoveredIdx(null)}
                        >
                            <img
                                src={`${API_URL}/published/${img.filename}`}
                                alt={img.name || `Published ${idx}`}
                                style={{
                                    width: '100%',
                                    height: 200,
                                    objectFit: 'contain',
                                    imageRendering: 'pixelated',
                                    background: '#eee',
                                    display: 'block',
                                }}
                            />
                            <div style={{ padding: 8, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>{img.name || img.filename}</div>
                            <button onClick={e => { e.stopPropagation(); handleLike(img); }} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'absolute', top: 12, right: 12 }}>
                                <FaHeart color="#e74c3c" size={22} />
                                <span style={{ marginLeft: 6, color: '#e74c3c', fontWeight: 600 }}>{getLikes(img.filename)}</span>
                            </button>
                        </div>
                    ))}
                </div>
                {/* Modal for selected image */}
                {selected && (
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                        onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
                    >
                        <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 320, boxShadow: '0 2px 16px rgba(0,0,0,0.12)', maxWidth: 400 }}>
                            <img src={`${API_URL}/published/${selected.filename}`} alt={selected.name} style={{ width: '100%', height: 200, objectFit: 'contain', imageRendering: 'pixelated', background: '#eee', display: 'block', marginBottom: 16 }} />
                            <h2 style={{ marginBottom: 8, textAlign: 'center' }}>{selected.name || selected.filename}</h2>
                            <div style={{ marginBottom: 16, color: '#555', textAlign: 'center' }}>{selected.description}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                                <button onClick={() => setSelected(null)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#eee', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Close</button>
                                <button onClick={handleImport} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Import</button>
                                <a
                                    href={`${API_URL}/published/${selected.filename}`}
                                    download={selected.filename}
                                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}
                                >
                                    Download
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GalleryPage; 