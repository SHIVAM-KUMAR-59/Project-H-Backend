const path = require('path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const morgan = require('morgan')
const hpp = require('hpp')
const xss = require('xss-clean')
const mongoSanitize = require('express-mongo-sanitize')
const http = require('http')
const setupSocketServer = require('./socket/setupSocket')

const { connectDB } = require('./config/configDB')
const logger = require('./utils/main/logger')
const apiRoutes = require('./routes/api')
const storyRouter = require('./routes/story')
const chatRouter = require('./routes/chat')
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
  origin: [
    'http://localhost:19006', 
    'http://localhost:19001', 
    'http://localhost:19000', 
    'http://localhost:5001',
    'http://localhost:3000',
    'http://10.0.2.2:8081', 
    'http://10.0.2.2:5001', 
    'http://10.0.2.2:19000', 
    'http://10.0.2.2:19001',
    'http://192.168.1.7:8081',
    'http://192.168.1.7:19000',
    'http://192.168.1.7:19001',
    'exp://192.168.1.40:8081',
    'exp://192.168.1.7:19000',
    'exp://192.168.1.7:19001',
    'http://192.168.1.40:5001',
    'exp://192.168.1.40:5001',
    'http://192.168.1.40:19000',
    'exp://192.168.1.40:19000',
    'http://192.168.1.40:19001',
    'exp://192.168.1.40:19001',
    'http://192.168.1.13:5001',
    'exp://192.168.1.13:5001',
    'http://192.168.1.13:19000',
    'exp://192.168.1.13:19000',
    'http://192.168.1.13:19001',
    'exp://192.168.1.13:19001',
    'http://192.168.1.13:8081',
    'exp://192.168.1.13:8081'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(limiter)

// Request Body Middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(express.json({ limit: '50mb' }))
app.use(bodyParser.json({ limit: '50mb' }))

// Logging Middleware
app.use(logger) // Logging Requests To Access Log

// Images Middleware
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Make sure the route is also available through the /api prefix 
app.use('/api/uploads', express.static(path.join(__dirname, 'public/uploads')));

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

// Mount chat routes under /api/chat
app.use('/api/chat', chatRouter)

// Route to check the user profile
app.get('/api/profile', verifyClerkToken, (req, res) => {
  res.json({
    message: 'User profile retrieved successfully',
    userId: req.userId,
  })
})

// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: 'Project-H-Backend',
    uptime: Math.floor(process.uptime()),
    database: {
      connected: mongoose.connection.readyState === 1,
      state: mongoose.connection.readyState
    }
  });
});

// Clerk Webhook endpoint (only apply webhook handler here)
app.post('/api/webhook', webhookHandler)

// 404 handler
app.all('*', (req, res) => {
  console.log('❌ 404 Not Found:', req.originalUrl);
  res
    .status(404)
    .json({ message: `${req.originalUrl} is not found on this server` })
})

// Create HTTP server
const server = http.createServer(app)

// Initialize Socket.io
const io = setupSocketServer(server)

// Set global variable for socket io
app.set('io', io)

// Start server
server.listen(PORT, () => {
  console.log(`
🚀 Server is running on http://localhost:${PORT}
📍 API endpoint: http://localhost:${PORT}/api
🔒 Environment: ${process.env.NODE_ENV || 'development'}
  `);
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION:', err);
  server.close(() => process.exit(1));
});
