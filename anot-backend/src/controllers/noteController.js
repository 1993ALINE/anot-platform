const pool = require('../config/db')
const { auditLog } = require('../utils/auditLogger')

// ─── GET NOTE BY VISIT ID ─────────────────────────────────────────────────────

const getNoteByVisit = async (req, res) => {
  try {
    const { visitId } = req.params
    const result = await pool.query(
      `SELECT n.*,
              v.visit_type, v.visit_date, v.visit_time,
              v.duration_seconds, v.audio_file,
              p.name  AS patient_name, p.mrn,
              c.name  AS clinician_name,
              COALESCE(sb.name, s.name) AS scribe_name,
              COALESCE(n.submitted_by, v.scribe_id) AS actual_scribe_id
       FROM notes n
       JOIN visits   v  ON v.id  = n.visit_id
       JOIN patients p  ON p.id  = v.patient_id
       JOIN users    c  ON c.id  = v.clinician_id
       LEFT JOIN users s  ON s.id  = v.scribe_id
       LEFT JOIN users sb ON sb.id = n.submitted_by
       WHERE n.visit_id = $1`,
      [visitId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Note not found for this visit.' })
    res.status(200).json({ note: result.rows[0] })
  } catch (err) {
    console.error('Get note error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── GET MY NOTES (Scribe) ────────────────────────────────────────────────────

const getMyNotes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*,
              v.visit_type, v.visit_date, v.visit_time,
              v.duration_seconds, v.audio_file,
              p.name AS patient_name, p.mrn,
              c.name AS clinician_name, c.id AS clinician_id,
              COALESCE(sb.name, s.name) AS scribe_name
       FROM notes n
       JOIN visits   v  ON v.id  = n.visit_id
       JOIN patients p  ON p.id  = v.patient_id
       JOIN users    c  ON c.id  = v.clinician_id
       LEFT JOIN users s  ON s.id  = v.scribe_id
       LEFT JOIN users sb ON sb.id = n.submitted_by
       WHERE v.scribe_id = $1 OR n.submitted_by = $1
       ORDER BY n.created_at DESC`,
      [req.user.id]
    )
    res.status(200).json({ notes: result.rows })
  } catch (err) {
    console.error('Get my notes error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── GET ALL NOTES (QPS / Admin) ─────────────────────────────────────────────

const getAllNotes = async (req, res) => {
  try {
    const { provider_id, status } = req.query

    let query = `
      SELECT n.*,
             v.visit_type, v.visit_date, v.visit_time,
             v.duration_seconds, v.audio_file,
             p.name AS patient_name, p.mrn,
             c.name AS clinician_name, c.id AS clinician_id,
             COALESCE(sb.name, s.name) AS scribe_name,
             COALESCE(n.submitted_by, v.scribe_id) AS actual_scribe_id
      FROM notes n
      JOIN visits   v  ON v.id  = n.visit_id
      JOIN patients p  ON p.id  = v.patient_id
      JOIN users    c  ON c.id  = v.clinician_id
      LEFT JOIN users s  ON s.id  = v.scribe_id
      LEFT JOIN users sb ON sb.id = n.submitted_by
      WHERE 1=1
    `
    const params = []

    if (provider_id) {
      params.push(provider_id)
      query += ` AND c.id = $${params.length}`
    }

    if (status) {
      params.push(status)
      query += ` AND n.status = $${params.length}`
    }

    query += ' ORDER BY n.created_at DESC'

    const result = await pool.query(query, params)
    res.status(200).json({ notes: result.rows })
  } catch (err) {
    console.error('Get all notes error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── GET NOTES FOR CLINICIAN REVIEW ──────────────────────────────────────────

const getClinicianNotes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*,
              v.visit_type, v.visit_date, v.visit_time,
              v.duration_seconds, v.audio_file,
              p.name AS patient_name, p.mrn,
              COALESCE(sb.name, s.name) AS scribe_name
       FROM notes n
       JOIN visits   v  ON v.id  = n.visit_id
       JOIN patients p  ON p.id  = v.patient_id
       LEFT JOIN users s  ON s.id  = v.scribe_id
       LEFT JOIN users sb ON sb.id = n.submitted_by
       WHERE v.clinician_id = $1
         AND n.status IN ('submitted', 'uploaded')
       ORDER BY n.updated_at DESC`,
      [req.user.id]
    )
    res.status(200).json({ notes: result.rows })
  } catch (err) {
    console.error('Get clinician notes error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── GET MY GRADES (Scribe) ───────────────────────────────────────────────────

const getMyGrades = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*,
              p.name AS patient_name, p.mrn,
              v.visit_type, v.visit_date,
              c.name AS clinician_name,
              q.name AS qps_name,
              n.final_note
       FROM grades g
       JOIN notes    n ON n.id  = g.note_id
       JOIN visits   v ON v.id  = n.visit_id
       JOIN patients p ON p.id  = v.patient_id
       JOIN users    c ON c.id  = v.clinician_id
       LEFT JOIN users q ON q.id = g.qps_id
       WHERE n.submitted_by = $1
          OR (n.submitted_by IS NULL AND v.scribe_id = $1)
       ORDER BY g.created_at DESC`,
      [req.user.id]
    )
    res.status(200).json({ grades: result.rows })
  } catch (err) {
    console.error('Get my grades error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── SAVE DRAFT ───────────────────────────────────────────────────────────────

const saveDraft = async (req, res) => {
  try {
    const { visit_id, transcription, ai_draft, final_note } = req.body
    if (!visit_id) return res.status(400).json({ error: 'Visit ID is required.' })

    const existing = await pool.query('SELECT id, status FROM notes WHERE visit_id = $1', [visit_id])

    let result
    if (existing.rows.length > 0) {
      const currentStatus = existing.rows[0].status
      const newStatus = ['submitted', 'uploaded'].includes(currentStatus) ? currentStatus : 'draft'

      result = await pool.query(
        `UPDATE notes
         SET transcription = COALESCE($1, transcription),
             ai_draft      = COALESCE($2, ai_draft),
             final_note    = COALESCE($3, final_note),
             status        = $4,
             updated_at    = NOW()
         WHERE visit_id = $5
         RETURNING *`,
        [transcription || null, ai_draft || null, final_note || null, newStatus, visit_id]
      )
    } else {
      result = await pool.query(
        `INSERT INTO notes (visit_id, transcription, ai_draft, final_note, status)
         VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
        [visit_id, transcription || null, ai_draft || null, final_note || null]
      )
    }

    res.status(200).json({ message: 'Draft saved successfully.', note: result.rows[0] })
  } catch (err) {
    console.error('Save draft error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── SUBMIT NOTE ──────────────────────────────────────────────────────────────

const submitNote = async (req, res) => {
  try {
    const { id }    = req.params
    const scribe_id = req.user.id

    const result = await pool.query(
      `UPDATE notes
       SET status       = 'submitted',
           submitted_by = $1,
           updated_at   = NOW()
       WHERE id = $2
       RETURNING *`,
      [scribe_id, id]
    )

    if (!result.rows[0]) return res.status(404).json({ error: 'Note not found.' })

    // Change visit status to note-ready (clinician can now review)
    await pool.query(
      `UPDATE visits SET status = 'note-ready' WHERE id = $1`,
      [result.rows[0].visit_id]
    )

    await auditLog(req.user, 'NOTE_SUBMITTED', 'note', id,
      `Note submitted for visit: ${result.rows[0].visit_id}`)

    res.status(200).json({ message: 'Note submitted successfully.', note: result.rows[0] })
  } catch (err) {
    console.error('Submit note error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── REQUEST EDIT ─────────────────────────────────────────────────────────────

const requestEdit = async (req, res) => {
  try {
    const { id } = req.params
    await pool.query(
      `UPDATE notes SET status = 'draft', updated_at = NOW() WHERE id = $1`,
      [id]
    )
    // Change visit back to recording-uploaded
    const note = await pool.query('SELECT visit_id FROM notes WHERE id = $1', [id])
    if (note.rows[0]) {
      await pool.query(
        `UPDATE visits SET status = 'recording-uploaded' WHERE id = $1`,
        [note.rows[0].visit_id]
      )
    }
    await auditLog(req.user, 'EDIT_REQUESTED', 'note', id, `Edit requested by clinician`)
    res.status(200).json({ message: 'Edit requested.' })
  } catch (err) {
    console.error('Request edit error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

// ─── SUBMIT GRADE ─────────────────────────────────────────────────────────────

const submitGrade = async (req, res) => {
  try {
    const { note_id, accuracy, completeness, terminology, formatting, comment } = req.body
    const qps_id = req.user.id

    if (!note_id) return res.status(400).json({ error: 'Note ID is required.' })

    const overall = Math.round((accuracy + completeness + terminology + formatting) / 4)

    const result = await pool.query(
      `INSERT INTO grades
         (note_id, qps_id, accuracy, completeness, terminology, formatting, overall_score, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (note_id) DO UPDATE
         SET accuracy = $3, completeness = $4, terminology = $5,
             formatting = $6, overall_score = $7, comment = $8, qps_id = $2
       RETURNING *`,
      [note_id, qps_id, accuracy, completeness, terminology, formatting, overall, comment || null]
    )

    await pool.query(`UPDATE notes SET status = 'uploaded', updated_at = NOW() WHERE id = $1`, [note_id])

    // Update visit status to uploaded
    const note = await pool.query('SELECT visit_id FROM notes WHERE id = $1', [note_id])
    if (note.rows[0]) {
      await pool.query(`UPDATE visits SET status = 'uploaded' WHERE id = $1`, [note.rows[0].visit_id])
    }

    // Fix missing scribe_id
    await pool.query(
      `UPDATE visits v
       SET scribe_id = sa.scribe_id
       FROM scribe_assignments sa
       WHERE v.clinician_id = sa.clinician_id
         AND v.scribe_id IS NULL
         AND v.id = (SELECT visit_id FROM notes WHERE id = $1)`,
      [note_id]
    )

    await auditLog(req.user, 'GRADE_SUBMITTED', 'note', note_id, `Grade: ${overall}/100`)

    res.status(201).json({ message: 'Grade submitted successfully.', grade: result.rows[0] })
  } catch (err) {
    console.error('Submit grade error:', err.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

module.exports = {
  getNoteByVisit, getMyNotes, getAllNotes, getClinicianNotes,
  getMyGrades, saveDraft, submitNote, requestEdit, submitGrade,
}