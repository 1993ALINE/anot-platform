const pool = require('../config/db')

// ─── GET ALL PATIENTS ─────────────────────────────────────────────────────────

const getAllPatients = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM patients ORDER BY name ASC`
        )
        res.status(200).json({ patients: result.rows })
    } catch (err) {
        console.error('Get patients error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── CREATE PATIENT ───────────────────────────────────────────────────────────

const createPatient = async (req, res) => {
    try {
        const { name, mrn, date_of_birth } = req.body

        if (!name || !mrn) {
            return res.status(400).json({ error: 'Name and MRN are required.' })
        }

        // Check MRN is unique
        const existing = await pool.query(
            'SELECT id FROM patients WHERE mrn = $1', [mrn]
        )
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'A patient with this MRN already exists.' })
        }

        const result = await pool.query(
            `INSERT INTO patients (name, mrn, date_of_birth)
             VALUES ($1, $2, $3)
                 RETURNING *`,
            [name.trim(), mrn.trim().toUpperCase(), date_of_birth || null]
        )

        res.status(201).json({
            message: 'Patient created successfully.',
            patient: result.rows[0],
        })
    } catch (err) {
        console.error('Create patient error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── GET SINGLE PATIENT ───────────────────────────────────────────────────────

const getPatient = async (req, res) => {
    try {
        const { id } = req.params
        const result = await pool.query(
            'SELECT * FROM patients WHERE id = $1', [id]
        )
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Patient not found.' })
        }
        res.status(200).json({ patient: result.rows[0] })
    } catch (err) {
        console.error('Get patient error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

module.exports = { getAllPatients, createPatient, getPatient }