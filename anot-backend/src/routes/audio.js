const express = require('express')
const router  = express.Router()
const multer  = require('multer')
const path    = require('path')
const fs      = require('fs')
const pool    = require('../config/db')
const { protect } = require('../middleware/auth')

// ─── Storage ──────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext    = file.mimetype.includes('mp4') ? 'mp4' : file.mimetype.includes('ogg') ? 'ogg' : 'webm'
    const unique = `visit_${req.params.visitId}_${Date.now()}.${ext}`
    cb(null, unique)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      cb(new Error('Only audio files are allowed.'))
    }
  },
})

// ─── Helper: stream file ──────────────────────────────────────────────────────

function streamFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found on server.' })
  }
  const stat     = fs.statSync(filePath)
  const fileSize = stat.size
  const ext      = path.extname(filePath).toLowerCase()
  const mimeType = ext === '.mp4' ? 'audio/mp4' : ext === '.ogg' ? 'audio/ogg' : 'audio/webm'

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type':   mimeType,
    'Accept-Ranges':  'bytes',
  })
  fs.createReadStream(filePath).pipe(res)
}

// ─── POST /api/audio/:visitId — Upload primary recording ─────────────────────

router.post('/:visitId', protect, upload.single('audio'), async (req, res) => {
  try {
    const { visitId } = req.params
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' })

    const audioPath = `/uploads/${req.file.filename}`

// Append to existing audio files
const existing = await pool.query('SELECT audio_file FROM visits WHERE id = $1', [visitId])
const existingFiles = existing.rows[0]?.audio_file || ''
const updated = existingFiles ? `${existingFiles},${audioPath}` : audioPath

await pool.query(
  'UPDATE visits SET audio_file = $1, status = $2 WHERE id = $3',
  [updated, 'recording-uploaded', visitId]
)

    res.status(200).json({
      message: 'Audio uploaded successfully.',
      audio_file: audioPath,
      filename: req.file.filename,
      size: req.file.size,
    })
  } catch (err) {
    console.error('Audio upload error:', err.message)
    res.status(500).json({ error: 'Failed to upload audio.' })
  }
})

// ─── POST /api/audio/:visitId/append — Append additional recording ───────────

router.post('/:visitId/append', protect, upload.single('audio'), async (req, res) => {
  try {
    const { visitId } = req.params
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' })

    const newPath = `/uploads/${req.file.filename}`

    // Get existing audio files
    const result = await pool.query('SELECT audio_file FROM visits WHERE id = $1', [visitId])
    const existing = result.rows[0]?.audio_file || ''

    const updated = existing
      ? `${existing},${newPath}`
      : newPath

    await pool.query(
      'UPDATE visits SET audio_file = $1 WHERE id = $2',
      [updated, visitId]
    )

    res.status(200).json({
      message: 'Additional recording uploaded.',
      audio_file: newPath,
      total_recordings: updated.split(',').length,
    })
  } catch (err) {
    console.error('Append audio error:', err.message)
    res.status(500).json({ error: 'Failed to upload additional recording.' })
  }
})

// ─── GET /api/audio/:visitId/count — Count recordings ────────────────────────

router.get('/:visitId/count', protect, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT audio_file FROM visits WHERE id = $1',
      [req.params.visitId]
    )
    const audioFile = result.rows[0]?.audio_file || ''
    const count = audioFile ? audioFile.split(',').filter(Boolean).length : 0
    res.json({ count })
  } catch (err) {
    console.error('Count audio error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ─── GET /api/audio/:visitId — Stream audio (supports ?index=N) ──────────────

router.get('/:visitId', protect, async (req, res) => {
  try {
    const { visitId } = req.params
    const index = parseInt(req.query.index || '0')

    const result = await pool.query(
      'SELECT audio_file FROM visits WHERE id = $1',
      [visitId]
    )

    if (!result.rows[0] || !result.rows[0].audio_file) {
      return res.status(404).json({ error: 'No audio found for this visit.' })
    }

    const files    = result.rows[0].audio_file.split(',').map(f => f.trim()).filter(Boolean)
    const filePath = files[index] || files[0]

    if (!filePath) return res.status(404).json({ error: 'Audio file not found.' })

    const audioPath = path.join(__dirname, '..', filePath)
    streamFile(res, audioPath)
  } catch (err) {
    console.error('Audio stream error:', err.message)
    res.status(500).json({ error: 'Failed to stream audio.' })
  }
})

module.exports = router