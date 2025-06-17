import React, { useState, useRef, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { FaFillDrip } from 'react-icons/fa';
import { supabase } from './supabaseClient';
const bucketCursor =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="%230071e3" d="M16 2l-6 6 2 2-8 8 2 2 8-8 2 2 6-6-2-2zm-6 18c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z"/></svg>';

const MIN_SIZE = 15;
const MAX_SIZE = 51;
const STEP = 3;
const COLORS = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Red', value: '#FF0000' },
    { name: 'Blue', value: '#0000FF' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Orange', value: '#FFA500' },
    { name: 'Black', value: '#000000' },
];
const MIN_BRUSH = 1;
const MAX_BRUSH = 10;

function isValidSize(value) {
    return value >= MIN_SIZE && value <= MAX_SIZE && value % STEP === 0;
}

// Helper to find the closest allowed color
function findClosestColor(r, g, b) {
    const allowedColors = COLORS.map(c => {
        const hex = c.value;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b, value: hex };
    });
    let minDist = Infinity;
    let closest = allowedColors[0];
    for (const color of allowedColors) {
        const dist = Math.sqrt(
            Math.pow(r - color.r, 2) +
            Math.pow(g - color.g, 2) +
            Math.pow(b - color.b, 2)
        );
        if (dist < minDist) {
            minDist = dist;
            closest = color;
        }
    }
    return closest.value;
}

const DrawingPage = () => {
    const [width, setWidth] = useState(15);
    const [height, setHeight] = useState(15);
    const [canvasCreated, setCanvasCreated] = useState(false);
    const [error, setError] = useState('');
    const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
    const [brushSize, setBrushSize] = useState(1);
    const [grid, setGrid] = useState([]);
    const [hoveredCell, setHoveredCell] = useState(null); // {row, col}
    const isDrawing = useRef(false);
    const gridRef = useRef(null);
    const fileInputRef = useRef(null);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [publishName, setPublishName] = useState('');
    const [publishDesc, setPublishDesc] = useState('');
    const [bucketMode, setBucketMode] = useState(false);
    const [bucketHighlight, setBucketHighlight] = useState([]);

    const handleCreateCanvas = () => {
        if (!isValidSize(width) || !isValidSize(height)) {
            setError(`Both width and height must be between ${MIN_SIZE} and ${MAX_SIZE}, and multiples of ${STEP}.`);
            return;
        }
        setError('');
        setCanvasCreated(true);
        const initialGrid = Array.from({ length: height }, () => Array(width).fill(COLORS[0].value));
        setGrid(initialGrid);
        setHistory([initialGrid]);
        setHistoryIndex(0);
    };

    const paint = (row, col) => {
        setGrid(prevGrid => {
            const newGrid = prevGrid.map(arr => arr.slice());
            const half = Math.floor(brushSize / 2);
            for (let dr = 0; dr < brushSize; dr++) {
                for (let dc = 0; dc < brushSize; dc++) {
                    const r = row - half + dr;
                    const c = col - half + dc;
                    if (r >= 0 && r < height && c >= 0 && c < width) {
                        newGrid[r][c] = selectedColor;
                    }
                }
            }
            return newGrid;
        });
    };

    const handleMouseDown = (row, col) => {
        isDrawing.current = true;
        if (bucketMode) {
            floodFill(row, col);
        } else {
            paint(row, col);
        }
    };

    const handleMouseUp = () => {
        isDrawing.current = false;
        setHistory(prevHistory => {
            const newHistory = prevHistory.slice(0, historyIndex + 1);
            newHistory.push(grid);
            setHistoryIndex(newHistory.length - 1);
            return newHistory;
        });
    };

    const handleMouseEnter = (row, col) => {
        setHoveredCell({ row, col });
        if (bucketMode) {
            setBucketHighlight(getConnectedComponent(row, col));
        } else {
            setBucketHighlight([]);
            if (isDrawing.current) {
                paint(row, col);
            }
        }
    };

    const handleMouseLeave = () => {
        setHoveredCell(null);
        setBucketHighlight([]);
        isDrawing.current = false;
    };

    // Helper to check if a cell is in the brush contour
    const isInBrush = (cellRow, cellCol) => {
        if (!hoveredCell) return false;
        const half = Math.floor(brushSize / 2);
        const { row, col } = hoveredCell;
        return (
            cellRow >= row - half &&
            cellRow <= row - half + brushSize - 1 &&
            cellCol >= col - half &&
            cellCol <= col - half + brushSize - 1
        );
    };

    // Download as PNG
    const handleDownload = () => {
        const cellSize = 20;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                ctx.fillStyle = grid[r][c];
                ctx.fillRect(c, r, 1, 1);
            }
        }
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `drawing_${width}x${height}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    };

    // Upload and convert image to 8-bit sketch
    const handleUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Create a canvas to crop the image to the current width and height
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = width;
                cropCanvas.height = height;
                const cropCtx = cropCanvas.getContext('2d');
                cropCtx.drawImage(img, 0, 0, width, height);
                const imageData = cropCtx.getImageData(0, 0, width, height);
                const newGrid = Array.from({ length: height }, () => Array(width).fill(COLORS[0].value));
                for (let row = 0; row < height; row++) {
                    for (let col = 0; col < width; col++) {
                        const idx = (row * width + col) * 4;
                        const rr = imageData.data[idx];
                        const gg = imageData.data[idx + 1];
                        const bb = imageData.data[idx + 2];
                        newGrid[row][col] = findClosestColor(rr, gg, bb);
                    }
                }
                setGrid(newGrid);
                setCanvasCreated(true);
                setHistory([newGrid]);
                setHistoryIndex(0);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    // Undo/Redo handlers for buttons
    const handleUndo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setGrid(history[historyIndex - 1]);
        }
    };
    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setGrid(history[historyIndex + 1]);
        }
    };

    // Updated publish handler with modal
    const handlePublish = () => {
        setShowPublishModal(true);
    };
    const handlePublishConfirm = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                ctx.fillStyle = grid[r][c];
                ctx.fillRect(c, r, 1, 1);
            }
        }
        canvas.toBlob(async (blob) => {
            const filename = `${publishName || 'drawing'}_${Date.now()}_${width}x${height}.png`;

            try {
                // 1. Upload to Supabase Storage
                const { data: storageData, error: storageError } = await supabase
                    .storage
                    .from('images')
                    .upload(filename, blob, {
                        contentType: 'image/png',
                        cacheControl: '3600',
                        upsert: false
                    });

                if (storageError) {
                    console.error('Storage Error:', storageError);
                    alert(`Failed to upload image to storage: ${storageError.message}`);
                    return;
                }

                console.log('Storage Success:', storageData);

                // 2. Get public URL
                const { data: publicUrlData } = supabase
                    .storage
                    .from('images')
                    .getPublicUrl(filename);

                console.log('Public URL:', publicUrlData);

                // 3. Insert metadata into images table
                const { error: dbError } = await supabase
                    .from('images')
                    .insert([{
                        name: publishName,
                        description: publishDesc,
                        url: publicUrlData.publicUrl,
                        created_at: new Date().toISOString(),
                    }]);

                if (dbError) {
                    console.error('Database Error:', dbError);
                    alert(`Failed to save image metadata: ${dbError.message}`);
                    return;
                }

                alert('Image published successfully!');
                setShowPublishModal(false);
                setPublishName('');
                setPublishDesc('');
            } catch (error) {
                console.error('Unexpected Error:', error);
                alert(`An unexpected error occurred: ${error.message}`);
            }
        }, 'image/png');
    };

    // Flood fill (bucket tool)
    const floodFill = (startRow, startCol) => {
        const targetColor = grid[startRow][startCol];
        if (targetColor === selectedColor) return;
        const newGrid = grid.map(row => row.slice());
        const stack = [[startRow, startCol]];
        const visited = Array.from({ length: height }, () => Array(width).fill(false));
        while (stack.length) {
            const [r, c] = stack.pop();
            if (
                r < 0 || r >= height || c < 0 || c >= width ||
                visited[r][c] || newGrid[r][c] !== targetColor
            ) continue;
            newGrid[r][c] = selectedColor;
            visited[r][c] = true;
            stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
        }
        setGrid(newGrid);
    };

    // Helper: get all connected pixels of the same color
    const getConnectedComponent = (startRow, startCol) => {
        const targetColor = grid[startRow][startCol];
        const visited = Array.from({ length: height }, () => Array(width).fill(false));
        const component = [];
        const stack = [[startRow, startCol]];
        while (stack.length) {
            const [r, c] = stack.pop();
            if (
                r < 0 || r >= height || c < 0 || c >= width ||
                visited[r][c] || grid[r][c] !== targetColor
            ) continue;
            visited[r][c] = true;
            component.push([r, c]);
            stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
        }
        return component;
    };

    useEffect(() => {
        // Import from gallery if present
        const imported = localStorage.getItem('importedImage');
        if (imported) {
            const imgData = JSON.parse(imported);
            const img = new window.Image();
            img.onload = () => {
                // Set width and height to match the imported image
                setWidth(img.width);
                setHeight(img.height);
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = img.width;
                cropCanvas.height = img.height;
                const cropCtx = cropCanvas.getContext('2d');
                cropCtx.drawImage(img, 0, 0, img.width, img.height);
                const imageData = cropCtx.getImageData(0, 0, img.width, img.height);
                const newGrid = Array.from({ length: img.height }, () => Array(img.width).fill(COLORS[0].value));
                for (let row = 0; row < img.height; row++) {
                    for (let col = 0; col < img.width; col++) {
                        const idx = (row * img.width + col) * 4;
                        const rr = imageData.data[idx];
                        const gg = imageData.data[idx + 1];
                        const bb = imageData.data[idx + 2];
                        newGrid[row][col] = findClosestColor(rr, gg, bb);
                    }
                }
                setGrid(newGrid);
                setCanvasCreated(true);
                setHistory([newGrid]);
                setHistoryIndex(0);
            };
            img.crossOrigin = 'Anonymous';
            img.src = `/published/${imgData.filename}`;
            localStorage.removeItem('importedImage');
        }
        // eslint-disable-next-line
    }, []);

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
            <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.08)', padding: 32, marginTop: 32 }}>
                <h1 style={{ textAlign: 'center', fontWeight: 700, fontSize: 36, letterSpacing: -1, color: '#222' }}>8-bit Drawing</h1>
                {!canvasCreated && (
                    <div style={{ marginBottom: 16 }}>
                        <label>
                            Width:
                            <input
                                type="number"
                                min={MIN_SIZE}
                                max={MAX_SIZE}
                                step={STEP}
                                value={width}
                                onChange={e => setWidth(Number(e.target.value))}
                                style={{ margin: '0 8px' }}
                            />
                        </label>
                        <label>
                            Height:
                            <input
                                type="number"
                                min={MIN_SIZE}
                                max={MAX_SIZE}
                                step={STEP}
                                value={height}
                                onChange={e => setHeight(Number(e.target.value))}
                                style={{ margin: '0 8px' }}
                            />
                        </label>
                        <button onClick={handleCreateCanvas}>Create Canvas</button>
                        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
                    </div>
                )}
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    style={{ display: 'none' }}
                    ref={fileInputRef}
                />
                {canvasCreated && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
                            <button onClick={handleUndo} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#e0e0e0', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Undo</button>
                            <button onClick={handleRedo} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#e0e0e0', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Redo</button>
                            <button onClick={() => { setCanvasCreated(false); setGrid([]); setHistory([]); setHistoryIndex(-1); setWidth(15); setHeight(15); }} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#f44336', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Reset</button>
                        </div>
                        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
                            {COLORS.map(color => (
                                <button
                                    key={color.value}
                                    onClick={() => setSelectedColor(color.value)}
                                    style={{
                                        background: color.value,
                                        border: selectedColor === color.value ? '2px solid #333' : '1px solid #ccc',
                                        width: 28,
                                        height: 28,
                                        marginRight: 2,
                                        cursor: 'pointer',
                                    }}
                                    aria-label={color.name}
                                />
                            ))}
                        </div>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
                            <span>Brush size: </span>
                            <input
                                type="range"
                                min={MIN_BRUSH}
                                max={MAX_BRUSH}
                                value={brushSize}
                                onChange={e => setBrushSize(Number(e.target.value))}
                                style={{ width: 120, marginLeft: 8 }}
                                disabled={bucketMode}
                            />
                            <span style={{ minWidth: 60, fontWeight: 600 }}>{brushSize} x {brushSize} px</span>
                            <button
                                onClick={() => setBucketMode(b => !b)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: bucketMode ? '2px solid #0071e3' : '1px solid #ccc',
                                    background: bucketMode ? '#e3f1ff' : '#fff',
                                    color: '#0071e3',
                                    fontWeight: 600,
                                    fontSize: 16,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8
                                }}
                                title='Bucket Fill'
                            >
                                <FaFillDrip size={20} />
                                Bucket
                            </button>
                        </div>
                        <div
                            ref={gridRef}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${width}, 20px)`,
                                gridTemplateRows: `repeat(${height}, 20px)`,
                                gap: 1,
                                background: '#888',
                                userSelect: 'none',
                                marginBottom: 24,
                                border: '2px solid #333',
                                width: width * 20 + (width - 1) * 1,
                                height: height * 20 + (height - 1) * 1,
                                cursor: bucketMode ? `url(${bucketCursor}) 10 10, pointer` : 'crosshair',
                                justifySelf: 'center',
                                alignSelf: 'center',
                                position: 'relative',
                            }}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                        >
                            {/* Pixel-perfect brush preview overlay */}
                            {!bucketMode && hoveredCell && (
                                Array.from({ length: brushSize }).flatMap((_, dr) =>
                                    Array.from({ length: brushSize }).map((_, dc) => {
                                        const r = hoveredCell.row - Math.floor(brushSize / 2) + dr;
                                        const c = hoveredCell.col - Math.floor(brushSize / 2) + dc;
                                        if (r < 0 || r >= height || c < 0 || c >= width) return null;
                                        return (
                                            <div
                                                key={`brush-preview-${r}-${c}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: c * 21,
                                                    top: r * 21,
                                                    width: 20,
                                                    height: 20,
                                                    border: '1px solid #2196f3',
                                                    background: 'rgba(0,113,227,0.10)',
                                                    pointerEvents: 'none',
                                                    boxSizing: 'border-box',
                                                    zIndex: 2,
                                                }}
                                            />
                                        );
                                    })
                                )
                            )}
                            {/* Bucket highlight overlay */}
                            {bucketMode && bucketHighlight.length > 0 && (
                                bucketHighlight.map(([r, c]) => (
                                    <div
                                        key={`bucket-hl-${r}-${c}`}
                                        style={{
                                            position: 'absolute',
                                            left: c * 21,
                                            top: r * 21,
                                            width: 20,
                                            height: 20,
                                            border: '2px solid #ff9800',
                                            pointerEvents: 'none',
                                            boxSizing: 'border-box',
                                            zIndex: 2,
                                        }}
                                    />
                                ))
                            )}
                            {/* Grid pixels */}
                            {grid.map((rowArr, rowIdx) =>
                                rowArr.map((color, colIdx) => (
                                    <div
                                        key={`${rowIdx}-${colIdx}`}
                                        onMouseDown={() => handleMouseDown(rowIdx, colIdx)}
                                        onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                        style={{
                                            width: 20,
                                            height: 20,
                                            background: color,
                                            border: '1px solid #bbb',
                                            boxSizing: 'border-box',
                                            position: 'relative',
                                            zIndex: 1,
                                        }}
                                    />
                                ))
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
                            <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={handleDownload}>Download</button>
                            <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={() => fileInputRef.current.click()}>Upload</button>
                            <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={handlePublish}>Publish</button>
                        </div>
                        {/* Publish Modal */}
                        {showPublishModal && (
                            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                                <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 320, boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
                                    <h2 style={{ marginBottom: 16 }}>Publish Drawing</h2>
                                    <input type="text" placeholder="Project Name" value={publishName} onChange={e => setPublishName(e.target.value)} style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                                    <textarea placeholder="Description" value={publishDesc} onChange={e => setPublishDesc(e.target.value)} style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid #ccc', minHeight: 60 }} />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                                        <button onClick={() => setShowPublishModal(false)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#eee', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Cancel</button>
                                        <button onClick={handlePublishConfirm} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Publish</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DrawingPage;
