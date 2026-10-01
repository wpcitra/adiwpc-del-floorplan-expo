import express from 'express';
import fs from 'fs';
import path from 'path';
import { saveDataUrl, uploadsDir, UPLOAD_NAME_RE, MIME_BY_EXT, MAX_UPLOAD_BYTES } from '../utils/uploads.js';

// Image storage (AGENTS.md §28): POST stores an image as a file, GET serves it. The database keeps the URL only.
const router = express.Router();

// POST /api/uploads { dataUrl } -> { url }   (staff who edit a floorplan or the invoice layout)
router.post('/', (req, res) => {
  try {
    const dataUrl = String(req.body?.dataUrl || '');
    if (!dataUrl.startsWith('data:image/')) return res.status(400).json({ success: false, error: 'File harus berupa gambar (PNG, JPG, WEBP, GIF, atau SVG).' });
    if (dataUrl.length > MAX_UPLOAD_BYTES * 1.4) return res.status(413).json({ success: false, error: `Gambar terlalu besar (maks. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).` });
    const url = saveDataUrl(dataUrl);
    if (!url) return res.status(400).json({ success: false, error: 'Gambar tidak dapat dibaca atau melebihi batas ukuran.' });
    res.json({ success: true, url });
  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({ success: false, error: 'Gambar gagal disimpan di server' });
  }
});

// GET /api/uploads/<sha256>.<ext> - public (the Live Floorplan shows the blueprint); the name is a content hash
router.get('/:name', (req, res) => {
  const name = String(req.params.name || '');
  if (!UPLOAD_NAME_RE.test(name)) return res.status(404).end();
  const file = path.join(uploadsDir, name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set({
    'Content-Type': MIME_BY_EXT[name.split('.').pop()],
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // an SVG opened directly must not run scripts
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Cross-Origin-Resource-Policy': 'cross-origin'
  });
  fs.createReadStream(file).pipe(res);
});

export default router;
