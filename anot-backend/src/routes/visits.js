const express = require('express')
const router  = express.Router()
const pool    = require('../config/db')
const {
  getVisitsByDate,
  getAllVisits,
  createVisit,
  updateVisitStatus,
  endVisit,
  updateVisit,
  deleteVisit,
  getVisitHistory,
} = require('../controllers/visitController')
const { protect, restrict } = require('../middleware/auth')

// Clinician routes
router.get('/my',      protect, restrict('clinician'), getVisitsByDate)
router.get('/history', protect, restrict('clinician'), getVisitHistory)
router.post('/',       protect, restrict('clinician'), createVisit)
router.put('/:id/end',    protect, restrict('clinician'), endVisit)
router.put('/:id/status', protect, updateVisitStatus)
router.put('/:id',        protect, restrict('clinician'), updateVisit)
router.delete('/:id',     protect, restrict('clinician'), deleteVisit)

// Scribe / QPS routes
router.get('/', protect, getAllVisits)

module.exports = router