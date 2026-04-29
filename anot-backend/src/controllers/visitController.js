const pool = require('../config/db')
const { auditLog } = require('../utils/auditLogger')

// ─── GET VISITS BY DATE FOR CLINICIAN ────────────────────────────────────────

const getVisitsByDate = async (req, res) => {
  try {
    const { date } = req.query
    const clinician_id = req.user.id

    const d = new Date()
    const localDate = date || `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    const result = await pool.query(
      `SELECT
         v.id, v.visit_date, v.visit_time, v.visit_type, v.status,
         v.duration_seconds, v.audio_file,
         p.id as patient_id, p.name as patient_name, p.mrn, p.date_of_birth,
         u.name as scribe_name, u.id as scribe_id
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN users u ON u.id = v.scribe_id
       WHERE v.clinician_id = $1 AND v.visit_date = $2
       ORDER BY v.visit_time ASC`,
      [clinician_id, localDate]
    )

    res.status(200).json({ visits: result.rows })
  } catch (err) {
    console.error('Get visits error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── GET ALL VISITS (scribe / qps view) ──────────────────────────────────────

const getAllVisits = async (req, res) => {
  try {
    const { provider_id, date } = req.query
    const user_id  = req.user.id
    const userRole = req.user.role

let query = `
  SELECT
    v.id, v.visit_date, v.visit_time, v.visit_type, v.status,
    v.duration_seconds, v.audio_file,
    p.id as patient_id, p.name as patient_name, p.mrn,
    c.name as clinician_name, c.id as clinician_id,
    s.name as scribe_name, s.id as scribe_id,
    n.id as note_id, n.status as note_status
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  JOIN users c    ON c.id = v.clinician_id
  LEFT JOIN users s ON s.id = v.scribe_id
  LEFT JOIN notes n ON n.visit_id = v.id
  WHERE 1=1
`
    const params = []

    if (provider_id) {
      params.push(provider_id)
      query += ` AND v.clinician_id = $${params.length}`
    }

    if (date) {
      params.push(date)
      query += ` AND v.visit_date = $${params.length}`
    }

    // Scribe only sees their assigned visits
    if (userRole === 'scribe') {
      params.push(user_id)
      query += ` AND (
        v.scribe_id = $${params.length}
        OR v.id IN (SELECT visit_id FROM notes WHERE submitted_by = $${params.length})
      )`
    }

    query += ' ORDER BY v.visit_date DESC, v.visit_time ASC'

    const result = await pool.query(query, params)
    res.status(200).json({ visits: result.rows })
  } catch (err) {
    console.error('Get all visits error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── CREATE VISIT ─────────────────────────────────────────────────────────────

const createVisit = async (req, res) => {
  try {
    const { patient_id, visit_date, visit_time, visit_type } = req.body
    const clinician_id = req.user.id

    if (!patient_id || !visit_date || !visit_time || !visit_type) {
      return res.status(400).json({ error: 'Patient, date, time and visit type are required.' })
    }

    // Auto-assign scribe from assignments
    const assignResult = await pool.query(
      'SELECT scribe_id FROM scribe_assignments WHERE clinician_id = $1 LIMIT 1',
      [clinician_id]
    )
    const scribe_id = assignResult.rows[0]?.scribe_id || null

    const result = await pool.query(
      `INSERT INTO visits (patient_id, clinician_id, scribe_id, visit_date, visit_time, visit_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'upcoming')
       RETURNING *`,
      [patient_id, clinician_id, scribe_id, visit_date, visit_time, visit_type]
    )

    const full = await pool.query(
      `SELECT v.*, p.name as patient_name, p.mrn
       FROM visits v JOIN patients p ON p.id = v.patient_id
       WHERE v.id = $1`,
      [result.rows[0].id]
    )

    res.status(201).json({ message: 'Visit scheduled successfully.', visit: full.rows[0] })
  } catch (err) {
    console.error('Create visit error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── UPDATE VISIT STATUS ──────────────────────────────────────────────────────

const updateVisitStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const validStatuses = ['scheduled', 'upcoming', 'in-progress', 'recording-uploaded', 'note-ready', 'done', 'uploaded']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' })
    }

    const result = await pool.query(
      'UPDATE visits SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    )

    if (!result.rows[0]) return res.status(404).json({ error: 'Visit not found.' })

    res.status(200).json({ message: 'Visit status updated.', visit: result.rows[0] })
  } catch (err) {
    console.error('Update visit status error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── END VISIT ────────────────────────────────────────────────────────────────

const endVisit = async (req, res) => {
  try {
    const { id } = req.params
    const { duration_seconds } = req.body

    // Status becomes recording-uploaded (scribe will change to note-ready on submission)
    const result = await pool.query(
      `UPDATE visits
       SET status = 'recording-uploaded', duration_seconds = $1
       WHERE id = $2
       RETURNING *`,
      [duration_seconds || 0, id]
    )

    if (!result.rows[0]) return res.status(404).json({ error: 'Visit not found.' })

    // Auto-create empty note
    const existingNote = await pool.query('SELECT id FROM notes WHERE visit_id = $1', [id])
    if (existingNote.rows.length === 0) {
      await pool.query(
        `INSERT INTO notes (visit_id, status) VALUES ($1, 'pending')`,
        [id]
      )
    }

    await auditLog(req.user, 'VISIT_ENDED', 'visit', id, `Visit ended — duration: ${duration_seconds}s`)

    res.status(200).json({ message: 'Visit ended. Recording uploaded.', visit: result.rows[0] })
  } catch (err) {
    console.error('End visit error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── UPDATE VISIT (time, type) ────────────────────────────────────────────────

const updateVisit = async (req, res) => {
  try {
    const { id } = req.params
    const { visit_time, visit_type } = req.body

    const result = await pool.query(
      `UPDATE visits SET visit_time = $1, visit_type = $2
       WHERE id = $3 AND clinician_id = $4
       RETURNING *`,
      [visit_time, visit_type, id, req.user.id]
    )

    if (!result.rows[0]) return res.status(404).json({ error: 'Visit not found.' })

    res.status(200).json({ message: 'Visit updated.', visit: result.rows[0] })
  } catch (err) {
    console.error('Update visit error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── DELETE VISIT ─────────────────────────────────────────────────────────────

const deleteVisit = async (req, res) => {
  try {
    const { id } = req.params

    const check = await pool.query('SELECT status, clinician_id FROM visits WHERE id = $1', [id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Visit not found.' })
    if (check.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Not authorized.' })

    await pool.query('DELETE FROM notes WHERE visit_id = $1', [id])
    await pool.query('DELETE FROM visits WHERE id = $1', [id])

    await auditLog(req.user, 'VISIT_DELETED', 'visit', id, `Visit deleted`)

    res.status(200).json({ message: 'Visit deleted.' })
  } catch (err) {
    console.error('Delete visit error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── GET VISIT HISTORY ────────────────────────────────────────────────────────

const getVisitHistory = async (req, res) => {
  try {
    const clinician_id = req.user.id

    const result = await pool.query(
      `SELECT
         v.id, v.visit_date, v.visit_time, v.visit_type, v.status,
         v.duration_seconds, v.audio_file,
         p.name as patient_name, p.mrn,
         COALESCE(sb.name, s.name) as scribe_name,
         n.final_note, n.id as note_id,
         g.overall_score as score
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN users s  ON s.id  = v.scribe_id
       LEFT JOIN notes n  ON n.visit_id = v.id
       LEFT JOIN users sb ON sb.id = n.submitted_by
       LEFT JOIN grades g ON g.note_id = n.id
       WHERE v.clinician_id = $1
         AND v.status IN ('done', 'recording-uploaded', 'note-ready', 'uploaded')
       ORDER BY v.visit_date DESC, v.visit_time DESC`,
      [clinician_id]
    )

    res.status(200).json({ visits: result.rows })
  } catch (err) {
    console.error('Get visit history error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

module.exports = {
  getVisitsByDate,
  getAllVisits,
  createVisit,
  updateVisitStatus,
  endVisit,
  updateVisit,
  deleteVisit,
  getVisitHistory,
}