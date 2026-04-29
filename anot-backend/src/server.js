const express = require('express')
const cors    = require('cors')
const dotenv  = require('dotenv')
const path    = require('path')

dotenv.config()
require('./config/db')

const app = express()

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve uploaded audio files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ message: '✅ Anot API is running', version: '1.0.0', status: 'healthy' })
})

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.use('/api/auth',        require('./routes/auth'))
app.use('/api/users',       require('./routes/users'))
app.use('/api/patients',    require('./routes/patients'))
app.use('/api/visits',      require('./routes/visits'))
app.use('/api/notes',       require('./routes/notes'))
app.use('/api/assignments', require('./routes/assignments'))
app.use('/api/audio',       require('./routes/audio'))
app.use('/api/audit',       require('./routes/audit'))

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
})

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Server error:', err.message)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  })
})

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 Anot server running on http://localhost:${PORT}`)
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`)
})