const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../config/db')

// ─── GENERATE JWT TOKEN ───────────────────────────────────────────────────────

const generateToken = (user) => {
    return jwt.sign(
        {
            id:        user.id,
            name:      user.name,
            email:     user.email,
            role:      user.role,
            specialty: user.specialty,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    )
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
    try {
        const { email, password, role } = req.body

        // Validate input
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Email, password and role are required.' })
        }

        // Find user by email
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase().trim()]
        )

        const user = result.rows[0]

        // Check user exists
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' })
        }

        // Check user is active
        if (user.status !== 'active') {
            return res.status(401).json({ error: 'Your account has been deactivated. Contact your administrator.' })
        }

        // Check role matches
        if (user.role !== role) {
            return res.status(401).json({ error: `This account is not registered as a ${role}.` })
        }

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.password)
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' })
        }

        // Generate token
        const token = generateToken(user)

        // Return user info and token
        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id:        user.id,
                name:      user.name,
                email:     user.email,
                role:      user.role,
                specialty: user.specialty,
                phone:     user.phone,
                npi:       user.npi,
                license:   user.license,
            },
        })
    } catch (err) {
        console.error('Login error:', err.message)
        res.status(500).json({ error: 'Server error during login.' })
    }
}

// ─── REGISTER (Admin only) ────────────────────────────────────────────────────

const register = async (req, res) => {
    try {
        const { name, email, password, role, specialty, phone, npi, license } = req.body

        // Validate required fields
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Name, email, password and role are required.' })
        }

        // Validate role
        const validRoles = ['clinician', 'scribe', 'qps', 'admin']
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role.' })
        }

        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' })
        }

        // Check if email already exists
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase().trim()]
        )
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'A user with this email already exists.' })
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10)

        // Insert new user
        const result = await pool.query(
            `INSERT INTO users (name, email, password, role, specialty, phone, npi, license, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
                 RETURNING id, name, email, role, specialty, phone, status, created_at`,
            [
                name.trim(),
                email.toLowerCase().trim(),
                hashedPassword,
                role,
                specialty || null,
                phone || null,
                npi || null,
                license || null,
            ]
        )

        res.status(201).json({
            message: `${role} registered successfully.`,
            user: result.rows[0],
        })
    } catch (err) {
        console.error('Register error:', err.message)
        res.status(500).json({ error: 'Server error during registration.' })
    }
}

// ─── GET CURRENT USER (from token) ───────────────────────────────────────────

const getMe = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, role, specialty, phone, npi, license, status, created_at FROM users WHERE id = $1',
            [req.user.id]
        )

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'User not found.' })
        }

        res.status(200).json({ user: result.rows[0] })
    } catch (err) {
        console.error('Get me error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' })
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters.' })
        }

        // Get user from database
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
        const user = result.rows[0]

        // Verify current password
        const match = await bcrypt.compare(currentPassword, user.password)
        if (!match) {
            return res.status(401).json({ error: 'Current password is incorrect.' })
        }

        // Hash new password
        const hashed = await bcrypt.hash(newPassword, 10)

        // Update password
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id])

        res.status(200).json({ message: 'Password changed successfully.' })
    } catch (err) {
        console.error('Change password error:', err.message)
        res.status(500).json({ error: 'Server error.' })
    }
}

module.exports = { login, register, getMe, changePassword }