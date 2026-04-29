const express = require('express')
const router = express.Router()
const { login, register, getMe, changePassword } = require('../controllers/authController')
const { protect, restrict } = require('../middleware/auth')

// POST /api/auth/login
router.post('/login', login)

// POST /api/auth/register (admin only)
router.post('/register', protect, restrict('admin'), register)

// GET /api/auth/me (get current logged in user)
router.get('/me', protect, getMe)

// PUT /api/auth/change-password
router.put('/change-password', protect, changePassword)

module.exports = router