const express = require('express')
const getNotifications = require('../controllers/notification/getNotifications')
const getUnreadCount = require('../controllers/notification/getUnreadCount')
const markAsRead = require('../controllers/notification/markAsRead')
const router = express.Router()

// Logging middleware for debugging notification routes
router.use((req, res, next) => {
  console.log(`🔔 Public notification route accessed: ${req.method} ${req.path}`)
  console.log('   Query params:', req.query)
  
  // Enable CORS specifically for these public routes
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  next()
})

// Public routes for testing without authentication
// These rely on the mongoUserId query parameter
router.get('/', getNotifications)
router.get('/unread', getUnreadCount)
router.post('/mark-read', markAsRead)

module.exports = router 