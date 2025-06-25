import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHeart } from 'react-icons/fa';
import { supabase } from './supabaseClient';

const API_URL = '';

const GalleryPage = () => {
    const [images, setImages] = useState([]);
    const [selected, setSelected] = useState(null);
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const [likedImages, setLikedImages] = useState(() => {
        return JSON.parse(localStorage.getItem('likedImages') || '[]');
    });
    const [sortBy, setSortBy] = useState('relevant'); // 'relevant', 'likes', 'date'
    const navigate = useNavigate();

    useEffect(() => {
        const fetchImages = async () => {
            let query = supabase.from('images').select('*');
            if (sortBy === 'likes') {
                query = query.order('likes', { ascending: false });
            } else if (sortBy === 'date') {
                query = query.order('created_at', { ascending: false });
            } else {
                query = query.order('created_at', { ascending: false }); // Default relevant = date desc
            }
            const { data, error } = await query;
            if (!error && data) setImages(data);
        };
        fetchImages();
    }, [sortBy]);

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

    const handleLike = async (imageId, alreadyLiked) => {
        setImages(prev =>
            prev.map(img =>
                img.id === imageId
                    ? { ...img, likes: img.likes + (alreadyLiked ? -1 : 1) }
                    : img
            )
        );
        let updatedLikedImages;
        if (alreadyLiked) {
            updatedLikedImages = likedImages.filter(id => id !== imageId);
        } else {
            updatedLikedImages = [...likedImages, imageId];
        }
        setLikedImages(updatedLikedImages);
        localStorage.setItem('likedImages', JSON.stringify(updatedLikedImages));
        const { error } = await supabase.rpc('increment_likes', {
            image_id: imageId,
            increment: alreadyLiked ? -1 : 1,
        });
        if (error) {
            alert('Error updating like!');
        }
        // Re-fetch images to get the updated like count from the database
        const { data, error: fetchError } = await supabase.from('images').select('*').order('created_at', { ascending: false });
        if (!fetchError && data) setImages(data);
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
            <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.08)', padding: 32, marginTop: 32 }}>
                <h1 style={{ textAlign: 'center', fontWeight: 700, fontSize: 36, letterSpacing: -1, color: '#222' }}>Gallery</h1>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '32px 0 16px 0' }}>
                    <div className="gallery-controls" style={{ display: 'flex', flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', width: '100%' }}>
                        <label htmlFor="sortDropdown" style={{ fontWeight: 600 }}>Sort by:</label>
                        <select id="sortDropdown" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 16 }}>
                            <option value="relevant">Relevant</option>
                            <option value="likes">Likes</option>
                            <option value="date">Date</option>
                        </select>
                        <input type="text" placeholder="Search..." style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc', fontSize: 16, width: 200 }} />
                    </div>
                </div>
                <div className="gallery-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 16,
                    marginTop: 32,
                    justifyItems: 'center',
                    width: '100%'
                }}>
                    {images.map((img, idx) => {
                        const isLiked = likedImages.includes(img.id);
                        return (
                            <div
                                key={img.id || img.url || idx}
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
                                    src={img.url}
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
                                <button onClick={(e) => { e.stopPropagation(); handleLike(img.id, isLiked); }} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'absolute', top: 12, right: 12 }}>
                                    <FaHeart color={isLiked ? "#e74c3c" : "#ccc"} size={22} />
                                    <span style={{ marginLeft: 6, color: isLiked ? "#e74c3c" : "#ccc", fontWeight: 600 }}>{img.likes}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
                {/* Modal for selected image */}
                {selected && (
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                        onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
                    >
                        <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 320, boxShadow: '0 2px 16px rgba(0,0,0,0.12)', maxWidth: 400 }}>
                            <img src={selected.url} alt={selected.name} style={{ width: '100%', height: 200, objectFit: 'contain', imageRendering: 'pixelated', background: '#eee', display: 'block', marginBottom: 16 }} />
                            <h2 style={{ marginBottom: 8, textAlign: 'center' }}>{selected.name || selected.filename}</h2>
                            <div style={{ marginBottom: 16, color: '#555', textAlign: 'center' }}>{selected.description}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                                <button onClick={() => setSelected(null)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#eee', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Close</button>
                                <button onClick={handleImport} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Import</button>
                                <a
                                    href={selected.url}
                                    download={selected.name || selected.filename || 'drawing.png'}
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