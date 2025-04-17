const express = require('express')
const router = express.Router()

// Routes
router.use('/notifications', require('../routes/notification'))
router.use('/public-notifications', require('../routes/publicNotifications'))
router.use('/auth', require('../routes/auth'))
router.use('/posts', require('../routes/post'))
router.use('/jobs', require('../routes/job'))
router.use('/users', require('../routes/user'))
router.use('/comments', require('../routes/comment'))
router.use('/clerk', require('../routes/clerk'))
router.use('/aws', require('../routes/aws'))

// Add file uploads route - make sure it's using the correct path
router.use('/uploads', require('./uploads'))

// Add direct debug route for notifications - this should work regardless of nested routes
router.get('/debug-notifications', async (req, res) => {
  const { mongoUserId } = req.query;
  
  if (!mongoUserId) {
    return res.status(400).json({
      success: false,
      message: 'Missing mongoUserId parameter'
    });
  }
  
  try {
    // Directly require and use the controller function
    const getNotifications = require('../controllers/notification/getNotifications');
    // Mock the req object
    const mockReq = {
      query: { mongoUserId },
      user: null
    };
    // Create a response handler
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          res.status(code).json(data);
        }
      })
    };
    
    // Call the controller directly
    await getNotifications(mockReq, mockRes);
  } catch (error) {
    console.error('Debug notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing debug notifications',
      error: error.message
    });
  }
});

// Log registered routes
console.log('📍 Registered API Routes:')
router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(
      `   ${Object.keys(r.route.methods).join(', ').toUpperCase()}: ${
        r.route.path
      }`,
    )
  } else if (r.name === 'router') {
    r.handle.stack.forEach((nestedRoute) => {
      if (nestedRoute.route) {
        const basePath = r.regexp.source
          .replace('\\/?(?=\\/|$)', '')
          .replace('^\\/', '/')
        console.log(
          `   ${Object.keys(nestedRoute.route.methods)
            .join(', ')
            .toUpperCase()}: ${basePath}${nestedRoute.route.path}`,
        )
      }
    })
  }
})

module.exports = router
