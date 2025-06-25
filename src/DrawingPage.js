import React, { useState, useRef, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { FaFillDrip } from 'react-icons/fa';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
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
    const [numCubesX, setNumCubesX] = useState(5);
    const [numCubesY, setNumCubesY] = useState(5);
    const width = numCubesX * 3;
    const height = numCubesY * 3;
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
    const [images, setImages] = useState([]);
    const [likedImages, setLikedImages] = useState(() =>
        JSON.parse(localStorage.getItem('likedImages') || '[]')
    );

    const handleCreateCanvas = () => {
        if (!Number.isInteger(numCubesX) || numCubesX < 5 || numCubesX > 17 || !Number.isInteger(numCubesY) || numCubesY < 5 || numCubesY > 17) {
            setError('Number of cubes must be an integer between 5 and 17 for both width and height.');
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
            console.log('Attempting to upload file:', filename, 'Size:', blob.size);

            try {
                // First, let's check if the bucket exists
                const { data: buckets, error: bucketsError } = await supabase
                    .storage
                    .listBuckets();

                console.log('Available buckets:', buckets);
                if (bucketsError) {
                    console.error('Error listing buckets:', bucketsError);
                }

                // 1. Upload to Supabase Storage
                console.log('Starting upload to storage...');
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
                const { data: insertData, error: dbError } = await supabase
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
                console.log('Inserted metadata:', insertData);

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

    const handleDownloadInstructions = () => {
        if (!canvasCreated) {
            alert('Create a canvas first!');
            return;
        }
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const blockSize = 3;
        const numBlocksX = Math.ceil(width / blockSize);
        const numBlocksY = Math.ceil(height / blockSize);
        const superBlockSize = 3; // 3x3 blocks per super-block
        const margin = 32;
        const blockRenderSize = 48; // px per block in PDF
        const blockGap = 8;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // --- First Page: Title, Border, and Original Image with High-Res Grid and Coordinates ---
        doc.setDrawColor(60, 60, 60);
        doc.setLineWidth(4);
        doc.roundedRect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin, 24, 24, 'S');
        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        doc.text('Mosaic Assembly Instructions', pageWidth / 2, margin + 24, { align: 'center' });

        // Draw the original mosaic as a zoomed image in the center
        const previewSize = Math.min(pageWidth - 2 * margin, 320);
        const previewX = (pageWidth - previewSize) / 2;
        const previewY = margin + 70;

        // Create a canvas for the mosaic
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = width;
        previewCanvas.height = height;
        const ctx = previewCanvas.getContext('2d');
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                ctx.fillStyle = grid[r][c];
                ctx.fillRect(c, r, 1, 1);
            }
        }
        const imgData = previewCanvas.toDataURL('image/png');
        doc.addImage(
            imgData,
            'PNG',
            previewX,
            previewY,
            previewSize,
            previewSize
        );

        // Now overlay high-res grid lines and coordinates using jsPDF
        const blocksX = Math.ceil(width / 3);
        const blocksY = Math.ceil(height / 3);

        // Calculate the scale from pixel art to PDF preview
        const scaleX = previewSize / width;
        const scaleY = previewSize / height;

        // Draw vertical grid lines
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(1.2);
        for (let bx = 1; bx < blocksX; bx++) {
            const x = previewX + bx * 3 * scaleX;
            doc.line(x, previewY, x, previewY + previewSize);
        }
        // Draw horizontal grid lines
        for (let by = 1; by < blocksY; by++) {
            const y = previewY + by * 3 * scaleY;
            doc.line(previewX, y, previewX + previewSize, y);
        }

        // Draw coordinates (A, B, C...) on top, (1, 2, 3...) on left
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        // Top coordinates
        for (let bx = 0; bx < blocksX; bx++) {
            const label = String.fromCharCode(65 + bx);
            const x = previewX + (bx * 3 + 1.5) * scaleX;
            doc.text(label, x, previewY - 8, { align: 'center' });
        }
        // Left coordinates
        for (let by = 0; by < blocksY; by++) {
            const label = (by + 1).toString();
            const y = previewY + (by * 3 + 1.5) * scaleY;
            doc.text(label, previewX - 10, y + 4, { align: 'right', baseline: 'middle' });
        }

        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(2);
        doc.roundedRect(previewX - 8, previewY - 8, previewSize + 16, previewSize + 16, 12, 12, 'S');
        doc.addPage();

        // --- Super-blocks ---
        const numSuperBlocksX = Math.ceil(numBlocksX / superBlockSize);
        const numSuperBlocksY = Math.ceil(numBlocksY / superBlockSize);

        for (let sby = 0; sby < numSuperBlocksY; sby++) {
            for (let sbx = 0; sbx < numSuperBlocksX; sbx++) {
                // Calculate how many blocks in this super-block (handle edge cases)
                const blocksInX = Math.min(superBlockSize, numBlocksX - sbx * superBlockSize);
                const blocksInY = Math.min(superBlockSize, numBlocksY - sby * superBlockSize);

                // Title for this super-block
                const colStart = String.fromCharCode(65 + sbx * superBlockSize);
                const colEnd = String.fromCharCode(65 + sbx * superBlockSize + blocksInX - 1);
                const rowStart = 1 + sby * superBlockSize;
                const rowEnd = rowStart + blocksInY - 1;
                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.text(
                    `Blocks ${colStart}-${colEnd} x ${rowStart}-${rowEnd}`,
                    pageWidth / 2,
                    margin + 10,
                    { align: 'center' }
                );

                // Calculate grid size for this super-block
                const gridRenderWidth = blocksInX * blockRenderSize + (blocksInX - 1) * blockGap;
                const gridRenderHeight = blocksInY * blockRenderSize + (blocksInY - 1) * blockGap;
                const startX = (pageWidth - gridRenderWidth) / 2;
                let startY = margin + 40;

                // Draw the blocks in their correct positions
                for (let by = 0; by < blocksInY; by++) {
                    for (let bx = 0; bx < blocksInX; bx++) {
                        const blockGlobalX = sbx * superBlockSize + bx;
                        const blockGlobalY = sby * superBlockSize + by;
                        const blockName = String.fromCharCode(65 + blockGlobalX) + (blockGlobalY + 1);

                        // Position in PDF
                        const blockX = startX + bx * (blockRenderSize + blockGap);
                        const blockY = startY + by * (blockRenderSize + blockGap);

                        // Draw block label above the block
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.text(blockName, blockX + blockRenderSize / 2, blockY - 4, { align: 'center' });

                        // Draw block border
                        doc.setDrawColor(80, 80, 80);
                        doc.setLineWidth(1.5);
                        doc.roundedRect(blockX - 2, blockY - 2, blockRenderSize + 4, blockRenderSize + 4, 4, 4, 'S');

                        // Draw the 3x3 block (handle edge cases)
                        for (let dy = 0; dy < blockSize; dy++) {
                            for (let dx = 0; dx < blockSize; dx++) {
                                const px = blockGlobalX * blockSize + dx;
                                const py = blockGlobalY * blockSize + dy;
                                if (px < width && py < height) {
                                    const color = grid[py][px];
                                    doc.setFillColor(color);
                                    doc.rect(
                                        blockX + dx * (blockRenderSize / blockSize),
                                        blockY + dy * (blockRenderSize / blockSize),
                                        blockRenderSize / blockSize,
                                        blockRenderSize / blockSize,
                                        'F'
                                    );
                                    // Optionally, add a border to each mini-cube
                                    doc.setDrawColor(180, 180, 180);
                                    doc.rect(
                                        blockX + dx * (blockRenderSize / blockSize),
                                        blockY + dy * (blockRenderSize / blockSize),
                                        blockRenderSize / blockSize,
                                        blockRenderSize / blockSize,
                                        'S'
                                    );
                                }
                            }
                        }
                    }
                }

                // Add a new page for the next super-block, unless it's the last one
                if (!(sby === numSuperBlocksY - 1 && sbx === numSuperBlocksX - 1)) {
                    doc.addPage();
                }
            }
        }

        doc.save('mosaic_instructions.pdf');
    };

    useEffect(() => {
        // Import from gallery if present
        const imported = localStorage.getItem('importedImage');
        if (imported) {
            const imgData = JSON.parse(imported);
            const img = new window.Image();
            img.onload = () => {
                // Calculate number of cubes for X and Y
                const cubesX = Math.ceil(img.width / 3);
                const cubesY = Math.ceil(img.height / 3);
                setNumCubesX(cubesX);
                setNumCubesY(cubesY);

                // Create the grid with the correct size
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = cubesX * 3;
                cropCanvas.height = cubesY * 3;
                const cropCtx = cropCanvas.getContext('2d');
                cropCtx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);
                const imageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
                const newGrid = Array.from({ length: cubesY * 3 }, () => Array(cubesX * 3).fill(COLORS[0].value));
                for (let row = 0; row < cubesY * 3; row++) {
                    for (let col = 0; col < cubesX * 3; col++) {
                        const idx = (row * cropCanvas.width + col) * 4;
                        const rr = imageData.data[idx];
                        const gg = imageData.data[idx + 1];
                        const bb = imageData.data[idx + 2];
                        newGrid[row][col] = findClosestColor(rr, gg, bb);
                    }
                }
                setGrid(newGrid);
                setHistory([newGrid]);
                setHistoryIndex(0);
                setCanvasCreated(true); // Show the canvas immediately
            };
            img.crossOrigin = 'Anonymous';
            img.src = imgData.url || `/published/${imgData.filename}`;
            localStorage.removeItem('importedImage');
        }
        // eslint-disable-next-line
    }, []);

    useEffect(() => {
        // Fetch images from Supabase
        const fetchImages = async () => {
            const { data, error } = await supabase.from('images').select('*');
            if (!error) setImages(data);
        };
        fetchImages();
    }, []);

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
        await supabase.rpc('increment_likes', {
            image_id: imageId,
            increment: alreadyLiked ? -1 : 1,
        });
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
            <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.08)', padding: 32, marginTop: 32 }}>
                <h1 style={{ textAlign: 'center', fontWeight: 700, fontSize: 36, letterSpacing: -1, color: '#222' }}>8-bit Drawing</h1>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
                    <label style={{ textAlign: 'center', marginBottom: 8 }}>
                        Number of cubes (each cube is 3x3 pixels):
                        <input
                            type="number"
                            min={5}
                            max={17}
                            value={numCubesX}
                            onChange={e => setNumCubesX(Number(e.target.value))}
                            style={{ margin: '0 8px' }}
                        />
                        <input
                            type="number"
                            min={5}
                            max={17}
                            value={numCubesY}
                            onChange={e => setNumCubesY(Number(e.target.value))}
                            style={{ margin: '0 8px' }}
                        />
                    </label>
                    <button onClick={handleCreateCanvas} style={{ marginTop: 8, alignSelf: 'center' }}>Create Canvas</button>
                    {error && <div style={{ color: 'red', marginTop: 8, textAlign: 'center' }}>{error}</div>}
                </div>
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
                            <button onClick={() => { setCanvasCreated(false); setGrid([]); setHistory([]); setHistoryIndex(-1); setNumCubesX(5); setNumCubesY(5); }} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#f44336', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Reset</button>
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
                                rowArr.map((color, colIdx) => {
                                    const isCubeRow = rowIdx % 3 === 0 && rowIdx !== 0;
                                    const isCubeCol = colIdx % 3 === 0 && colIdx !== 0;
                                    return (
                                        <div
                                            key={`${rowIdx}-${colIdx}`}
                                            onMouseDown={() => handleMouseDown(rowIdx, colIdx)}
                                            onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                            style={{
                                                width: 20,
                                                height: 20,
                                                background: color,
                                                border: '1px solid #bbb',
                                                borderTop: isCubeRow ? '2px solid #888' : '1px solid #bbb',
                                                borderLeft: isCubeCol ? '2px solid #888' : '1px solid #bbb',
                                                boxSizing: 'border-box',
                                                position: 'relative',
                                                zIndex: 1,
                                            }}
                                        />
                                    );
                                })
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
                            <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={handleDownload}>Download</button>
                            <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={() => fileInputRef.current.click()}>Upload</button>
                            <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={handlePublish}>Publish</button>
                            <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={handleDownloadInstructions}>Download Instructions</button>
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
