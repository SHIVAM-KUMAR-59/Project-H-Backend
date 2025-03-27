const path = require('path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const bodyParser = require('body-parser')

const { connectDB } = require('./config/configDB')
const logger = require('./utils/main/logger')
const apiRoutes = require('./routes/api')
const storyRouter = require('./routes/story')
const { webhookHandler } = require('./middleware/clerk/webhook')
const { verifyClerkToken } = require('./middleware/clerk/verifyToken')

const app = express()

// Basic request logging - before any middleware
app.use((req, res, next) => {
  console.log('\n🔔 INCOMING REQUEST:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      authorization: req.headers.authorization ? 'Bearer ...' : 'None'
    }
  })
  next()
})

// Enable trust proxy
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 350, // Limit each IP to 350 requests
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  message: { message: 'Too Many Requests, Try Again in 10 minutes' },
})

// Security Middlwares
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:19000', 'http://localhost:19001', 'http://10.0.2.2:19000', 'http://10.0.2.2:19001'],
  credentials: true
}))
app.use(limiter)

// Request Body Middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(express.json({ limit: '50mb' }))
app.use(bodyParser.json({ limit: '50mb' }))

// Logging Middleware
app.use(logger) // Logging Requests To Access Log

// Images Middleware
app.use(express.static(path.resolve('./public')))

// Log all API requests for debugging
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path.includes('/stories')) {
    console.log('📝 Story request body keys:', Object.keys(req.body));
    
    // Enhanced logging for story creation
    if (req.path.includes('/create')) {
      if (req.body.image && typeof req.body.image === 'string') {
        console.log('📝 Image data type:', typeof req.body.image);
        console.log('📝 Image data prefix:', req.body.image.substring(0, 30) + '...');
      } else {
        console.log('📝 Image data missing or not a string');
      }
      
      if (req.body.userId) {
        console.log('📝 User ID in request:', req.body.userId);
      } else {
        console.log('📝 User ID missing in request');
      }
    }
  }
  next();
})

const PORT = process.env.PORT || 5001

// Connect to MongoDB
connectDB()

// Mount API routes under /api
app.use('/api', apiRoutes)

// Mount story routes directly under /api/stories
app.use('/api/stories', storyRouter)

// Route to check the user profile
app.get('/api/profile', verifyClerkToken, (req, res) => {
  res.json({
    message: 'User profile retrieved successfully',
    userId: req.userId,
  })
})

// Clerk Webhook endpoint (only apply webhook handler here)
app.post('/api/webhook', webhookHandler)

// 404 handler
app.all('*', (req, res) => {
  console.log('❌ 404 Not Found:', req.originalUrl);
  res
    .status(404)
    .json({ message: `${req.originalUrl} is not found on this server` })
})

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Server is running on http://localhost:${PORT}
📍 API endpoint: http://localhost:${PORT}/api
🔒 Environment: ${process.env.NODE_ENV || 'development'}
  `);
});
