const express = require('express')
const router  = express.Router()
const pool    = require('../config/db')
const { protect, restrict } = require('../middleware/auth')
const { auditLog } = require('../utils/auditLogger')

router.use(protect)

// ─── GET ALL ASSIGNMENTS ──────────────────────────────────────────────────────

router.get('/', restrict('admin', 'scribe', 'qps', 'clinician'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sa.id,
        sa.clinician_id,
        sa.scribe_id,
        sa.assigned_at,
        c.name     AS clinician_name,
        c.specialty AS clinician_specialty,
        s.name     AS scribe_name,
        s.email    AS scribe_email
      FROM scribe_assignments sa
      JOIN users c ON c.id = sa.clinician_id
      JOIN users s ON s.id = sa.scribe_id
      ORDER BY sa.assigned_at DESC
    `)
    res.json({ assignments: result.rows })
  } catch (err) {
    console.error('Get assignments error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ─── CREATE ASSIGNMENT ────────────────────────────────────────────────────────

router.post('/', restrict('admin'), async (req, res) => {
  try {
    const { clinician_id, scribe_id } = req.body
    if (!clinician_id || !scribe_id) {
      return res.status(400).json({ error: 'Clinician and scribe are required.' })
    }

    // Create assignment
    const result = await pool.query(`
      INSERT INTO scribe_assignments (clinician_id, scribe_id)
      VALUES ($1, $2) RETURNING *
    `, [clinician_id, scribe_id])

    // ── Auto-update ALL existing visits for this clinician to new scribe ──
    const updated = await pool.query(`
      UPDATE visits
      SET scribe_id = $1
      WHERE clinician_id = $2
        AND status NOT IN ('uploaded')
      RETURNING id
    `, [scribe_id, clinician_id])

    console.log(`✅ Updated ${updated.rowCount} existing visits to new scribe`)

    // Get full assignment with names
    const full = await pool.query(`
      SELECT
        sa.id, sa.clinician_id, sa.scribe_id, sa.assigned_at,
        c.name     AS clinician_name,
        c.specialty AS clinician_specialty,
        s.name     AS scribe_name,
        s.email    AS scribe_email
      FROM scribe_assignments sa
      JOIN users c ON c.id = sa.clinician_id
      JOIN users s ON s.id = sa.scribe_id
      WHERE sa.id = $1
    `, [result.rows[0].id])

    await auditLog(req.user, 'SCRIBE_ASSIGNED', 'assignment', result.rows[0].id,
      `${full.rows[0].scribe_name} assigned to ${full.rows[0].clinician_name} — ${updated.rowCount} visits updated`)

    res.status(201).json({
      assignment: full.rows[0],
      visits_updated: updated.rowCount,
    })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This scribe is already assigned to this clinician.' })
    }
    console.error('Create assignment error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ─── DELETE ASSIGNMENT ────────────────────────────────────────────────────────

router.delete('/:id', restrict('admin'), async (req, res) => {
  try {
    const assignment = await pool.query(`
      SELECT sa.*, c.name AS clinician_name, s.name AS scribe_name
      FROM scribe_assignments sa
      JOIN users c ON c.id = sa.clinician_id
      JOIN users s ON s.id = sa.scribe_id
      WHERE sa.id = $1
    `, [req.params.id])

    if (!assignment.rows[0]) {
      return res.status(404).json({ error: 'Assignment not found.' })
    }

    await pool.query('DELETE FROM scribe_assignments WHERE id = $1', [req.params.id])

    await auditLog(req.user, 'SCRIBE_UNASSIGNED', 'assignment', req.params.id,
      `${assignment.rows[0].scribe_name} removed from ${assignment.rows[0].clinician_name}`)

    res.json({ message: 'Assignment removed.' })
  } catch (err) {
    console.error('Delete assignment error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ─── GET MY CLINICIANS (Scribe) ───────────────────────────────────────────────

router.get('/my-clinicians', restrict('scribe'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sa.clinician_id,
        c.name      AS clinician_name,
        c.specialty
      FROM scribe_assignments sa
      JOIN users c ON c.id = sa.clinician_id
      WHERE sa.scribe_id = $1
    `, [req.user.id])
    res.json({ clinicians: result.rows })
  } catch (err) {
    console.error('Get my clinicians error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router