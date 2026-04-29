const express = require('express')
const router  = express.Router()
const pool    = require('../config/db')
const { protect, restrict } = require('../middleware/auth')

// GET /api/audit — get audit logs (admin only)
router.get('/', protect, restrict('admin'), async (req, res) => {
    try {
        const { limit = 200, role, action } = req.query

        let query = `SELECT * FROM audit_logs WHERE 1=1`
        const params = []

        if (role) {
            params.push(role)
            query += ` AND user_role = $${params.length}`
        }

        if (action) {
            params.push(action)
            query += ` AND action = $${params.length}`
        }

        params.push(parseInt(limit))
        query += ` ORDER BY created_at DESC LIMIT $${params.length}`

        const result = await pool.query(query, params)
        res.json({ logs: result.rows })
    } catch (err) {
        console.error('Get audit logs error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
})

module.exports = router