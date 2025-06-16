const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 5050;

app.use(cors());
app.use('/published', express.static(path.join(__dirname, 'public/published')));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public/published'));
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
    const { name, description } = req.body;
    const meta = { name, description };
    const metaPath = path.join(__dirname, 'public/published', req.file.filename.replace(/\.png$/, '.json'));
    fs.writeFileSync(metaPath, JSON.stringify(meta));
    res.json({ success: true, filename: req.file.filename });
});

app.get('/api/published', (req, res) => {
    const dir = path.join(__dirname, 'public/published');
    fs.readdir(dir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read published images' });
        const pngs = files.filter(f => f.endsWith('.png'));
        const result = pngs.map(filename => {
            let meta = {};
            try {
                const metaPath = path.join(dir, filename.replace(/\.png$/, '.json'));
                if (fs.existsSync(metaPath)) {
                    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                }
            } catch { }
            return { filename, ...meta };
        });
        res.json(result);
    });
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'build')));

// For any other route, serve index.html from the build
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}); 