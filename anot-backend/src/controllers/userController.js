const pool    = require('../config/db')
const bcrypt  = require('bcryptjs')
const { auditLog } = require('../utils/auditLogger')

// ─── GET ALL USERS ────────────────────────────────────────────────────────────

const getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, role, specialty, phone, npi, license, status, rate_per_note, created_at
             FROM users ORDER BY created_at DESC`
        )
        res.status(200).json({ users: result.rows })
    } catch (err) {
        console.error('Get all users error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── GET SINGLE USER ──────────────────────────────────────────────────────────

const getUser = async (req, res) => {
    try {
        const { id } = req.params
        const result = await pool.query(
            `SELECT id, name, email, role, specialty, phone, npi, license, status, rate_per_note, created_at
             FROM users WHERE id = $1`,
            [id]
        )
        if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' })
        res.status(200).json({ user: result.rows[0] })
    } catch (err) {
        console.error('Get user error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── UPDATE USER ──────────────────────────────────────────────────────────────

const updateUser = async (req, res) => {
    try {
        const { id } = req.params
        const { name, email, role, specialty, phone, npi, license, rate_per_note } = req.body

        if (!name || !email || !role) {
            return res.status(400).json({ error: 'Name, email and role are required.' })
        }

        const result = await pool.query(
            `UPDATE users
             SET name = $1, email = $2, role = $3, specialty = $4,
                 phone = $5, npi = $6, license = $7, rate_per_note = $8
             WHERE id = $9
                 RETURNING id, name, email, role, specialty, phone, npi, license, status, rate_per_note`,
            [name, email.toLowerCase().trim(), role, specialty || null,
                phone || null, npi || null, license || null,
                rate_per_note != null ? parseFloat(rate_per_note) : 2.50, id]
        )

        if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' })

        await auditLog(req.user, 'USER_UPDATED', 'user', id,
            `Updated: ${name} (${email}) — role: ${role}`)

        res.status(200).json({ message: 'User updated successfully.', user: result.rows[0] })
    } catch (err) {
        console.error('Update user error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── TOGGLE USER STATUS ───────────────────────────────────────────────────────

const toggleStatus = async (req, res) => {
    try {
        const { id } = req.params
        const current = await pool.query('SELECT status, name FROM users WHERE id = $1', [id])
        if (!current.rows[0]) return res.status(404).json({ error: 'User not found.' })

        const newStatus = current.rows[0].status === 'active' ? 'inactive' : 'active'
        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, status',
            [newStatus, id]
        )

        await auditLog(req.user,
            newStatus === 'active' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
            'user', id,
            `${newStatus === 'active' ? 'Activated' : 'Deactivated'}: ${current.rows[0].name}`)

        res.status(200).json({
            message: `User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully.`,
            user: result.rows[0],
        })
    } catch (err) {
        console.error('Toggle status error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── DELETE USER ──────────────────────────────────────────────────────────────

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'You cannot delete your own account.' })
        }
        const user = await pool.query('SELECT name FROM users WHERE id = $1', [id])
        await pool.query('DELETE FROM users WHERE id = $1', [id])
        await auditLog(req.user, 'USER_DELETED', 'user', id, `Deleted: ${user.rows[0]?.name}`)
        res.status(200).json({ message: 'User deleted successfully.' })
    } catch (err) {
        console.error('Delete user error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── GET USERS BY ROLE ────────────────────────────────────────────────────────

const getUsersByRole = async (req, res) => {
    try {
        const { role } = req.params
        const result = await pool.query(
            `SELECT id, name, email, role, specialty, phone, status, rate_per_note
             FROM users WHERE role = $1 AND status = 'active' ORDER BY name ASC`,
            [role]
        )
        res.status(200).json({ users: result.rows })
    } catch (err) {
        console.error('Get users by role error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── UPDATE RATE PER NOTE ─────────────────────────────────────────────────────

const updateRate = async (req, res) => {
    try {
        const { id } = req.params
        const { rate_per_note } = req.body

        if (rate_per_note == null || isNaN(rate_per_note) || rate_per_note < 0) {
            return res.status(400).json({ error: 'Valid rate is required.' })
        }

        const result = await pool.query(
            `UPDATE users SET rate_per_note = $1 WHERE id = $2
                RETURNING id, name, role, rate_per_note`,
            [parseFloat(rate_per_note), id]
        )

        if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' })

        await auditLog(req.user, 'RATE_UPDATED', 'user', id,
            `Rate updated to $${rate_per_note} for: ${result.rows[0].name}`)

        res.status(200).json({ message: `Rate updated for ${result.rows[0].name}`, user: result.rows[0] })
    } catch (err) {
        console.error('Update rate error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

const resetPassword = async (req, res) => {
    try {
        const { id } = req.params
        const { password } = req.body

        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' })
        }

        const hashed = await bcrypt.hash(password, 10)
        const result = await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, name, email',
            [hashed, id]
        )

        if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' })

        await auditLog(req.user, 'PASSWORD_RESET', 'user', id,
            `Password reset for: ${result.rows[0].name} (${result.rows[0].email})`)

        res.status(200).json({ message: `Password reset successfully for ${result.rows[0].name}.` })
    } catch (err) {
        console.error('Reset password error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── GET ADMIN STATS ──────────────────────────────────────────────────────────

const getAdminStats = async (req, res) => {
    try {
        const clinicians    = await pool.query(`SELECT COUNT(*) FROM users WHERE role = 'clinician' AND status = 'active'`)
        const scribes       = await pool.query(`SELECT COUNT(*) FROM users WHERE role = 'scribe' AND status = 'active'`)
        const qps           = await pool.query(`SELECT COUNT(*) FROM users WHERE role = 'qps' AND status = 'active'`)
        const totalNotes    = await pool.query(`SELECT COUNT(*) FROM notes`)
        const pendingNotes  = await pool.query(`SELECT COUNT(*) FROM notes WHERE status = 'submitted'`)
        const uploadedNotes = await pool.query(`SELECT COUNT(*) FROM notes WHERE status = 'uploaded'`)

        res.status(200).json({
            stats: {
                clinicians:    parseInt(clinicians.rows[0].count),
                scribes:       parseInt(scribes.rows[0].count),
                qps:           parseInt(qps.rows[0].count),
                totalNotes:    parseInt(totalNotes.rows[0].count),
                pendingNotes:  parseInt(pendingNotes.rows[0].count),
                uploadedNotes: parseInt(uploadedNotes.rows[0].count),
            }
        })
    } catch (err) {
        console.error('Get admin stats error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── GET PAYROLL ──────────────────────────────────────────────────────────────

const getPayroll = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id, u.name, u.email, u.role, u.status, u.rate_per_note,
                COUNT(n.id) FILTER (WHERE n.status IN ('submitted','uploaded')) AS notes_completed,
                COALESCE(ROUND(AVG(g.overall_score)), 0) AS overall_avg,
                COUNT(n.id) FILTER (WHERE n.status IN ('submitted','uploaded')) * u.rate_per_note AS total_amount
            FROM users u
                     LEFT JOIN notes n ON (
                n.submitted_by = u.id
                    OR (n.submitted_by IS NULL AND n.visit_id IN (
                    SELECT id FROM visits WHERE scribe_id = u.id
                ))
                )
                     LEFT JOIN grades g ON g.note_id = n.id
            WHERE u.role IN ('scribe', 'qps', 'admin')
            GROUP BY u.id, u.name, u.email, u.role, u.status, u.rate_per_note
            ORDER BY u.role ASC, notes_completed DESC
        `)
        res.status(200).json({ payroll: result.rows })
    } catch (err) {
        console.error('Get payroll error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── GET PERFORMANCE ──────────────────────────────────────────────────────────

const getPerformance = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id, u.name, u.email, u.role, u.status, u.rate_per_note,
                COUNT(n.id) FILTER (WHERE n.status IN ('submitted','uploaded')) AS notes_completed,
                COALESCE(ROUND(AVG(g.overall_score)), 0)   AS overall_avg,
                COALESCE(ROUND(AVG(g.accuracy)), 0)        AS accuracy_avg,
                COALESCE(ROUND(AVG(g.completeness)), 0)    AS completeness_avg,
                COALESCE(ROUND(AVG(g.terminology)), 0)     AS terminology_avg,
                COALESCE(ROUND(AVG(g.formatting)), 0)      AS formatting_avg
            FROM users u
                     LEFT JOIN notes n ON (
                n.submitted_by = u.id
                    OR (n.submitted_by IS NULL AND n.visit_id IN (
                    SELECT id FROM visits WHERE scribe_id = u.id
                ))
                )
                     LEFT JOIN grades g ON g.note_id = n.id
            WHERE u.role IN ('scribe', 'qps', 'admin')
            GROUP BY u.id, u.name, u.email, u.role, u.status, u.rate_per_note
            ORDER BY overall_avg DESC
        `)
        res.status(200).json({ performance: result.rows })
    } catch (err) {
        console.error('Get performance error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

module.exports = {
    getAllUsers, getUser, updateUser, toggleStatus, deleteUser,
    getUsersByRole, getAdminStats, getPayroll, getPerformance,
    updateRate, resetPassword,
}