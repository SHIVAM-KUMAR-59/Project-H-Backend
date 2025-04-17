const express = require('express')
const { saveToken } = require('../controllers/notification/saveToken')
const sendNotification = require('../controllers/notification/sendNotification')
const { verifyClerkToken } = require('../middleware/clerk/verifyToken')
const getNotifications = require('../controllers/notification/getNotifications')
const getUnreadCount = require('../controllers/notification/getUnreadCount')
const markAsRead = require('../controllers/notification/markAsRead')
const deleteNotification = require('../controllers/notification/deleteNotification')
const router = express.Router()

// Logging middleware for debugging notification routes
router.use((req, res, next) => {
  console.log(`🔔 Notification route accessed: ${req.method} ${req.path}`)
  console.log('   Query params:', req.query)
  next()
})

// Custom middleware for token endpoint
const conditionalAuth = (req, res, next) => {
  // If it's the token endpoint and has mongoUserId, skip auth
  if ((req.path === '/token' && req.method === 'POST') && req.query.mongoUserId) {
    console.log('📲 Bypassing auth for push token with mongoUserId:', req.query.mongoUserId)
    return next()
  }
  
  // If it's the send endpoint and has mongoUserId, skip auth
  if ((req.path === '/send' && req.method === 'POST') && req.query.mongoUserId) {
    console.log('📲 Bypassing auth for push notification with mongoUserId:', req.query.mongoUserId)
    return next()
  }
  
  // Otherwise, apply the clerk token verification
  return verifyClerkToken(req, res, next)
}

// Use conditional auth instead of always requiring auth
router.use(conditionalAuth)

// Routes
router.post('/token', saveToken)
router.post('/send', sendNotification)
router.get('/', getNotifications)
router.get('/unread', getUnreadCount)
router.post('/mark-read', markAsRead)
router.delete('/', deleteNotification)

module.exports = router
