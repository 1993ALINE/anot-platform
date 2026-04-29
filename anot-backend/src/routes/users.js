const express = require('express')
const router  = express.Router()
const {
  getAllUsers,
  getUser,
  updateUser,
  toggleStatus,
  deleteUser,
  getUsersByRole,
  getAdminStats,
  getPayroll,
  getPerformance,
  updateRate,
  resetPassword,
} = require('../controllers/userController')
const { protect, restrict } = require('../middleware/auth')

// ─── USER ROUTES ──────────────────────────────────────────────────────────────

router.get('/',                protect, restrict('admin'),            getAllUsers)
router.get('/stats',           protect, restrict('admin'),            getAdminStats)
router.get('/payroll',         protect, restrict('admin'),            getPayroll)
router.get('/performance',     protect, restrict('admin'),            getPerformance)
router.get('/role/:role',      protect,                               getUsersByRole)
router.get('/:id',             protect, restrict('admin'),            getUser)
router.put('/:id',             protect, restrict('admin'),            updateUser)
router.put('/:id/toggle-status', protect, restrict('admin'),          toggleStatus)
router.put('/:id/reset-password', protect, restrict('admin'),         resetPassword)
router.put('/:id/rate',        protect, restrict('admin'),            updateRate)
router.delete('/:id',          protect, restrict('admin'),            deleteUser)

module.exports = router