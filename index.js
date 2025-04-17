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

// BACKUP ROUTE: Add direct access to public notifications without /api prefix
app.use('/public-notifications', require('./routes/publicNotifications'))

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

// Health check endpoint for notifications (no auth required)
app.get('/api/notifications-health', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    routes: {
      notifications: '/api/notifications',
      notificationsUnread: '/api/notifications/unread', 
      publicNotifications: '/api/public-notifications',
      publicNotificationsUnread: '/api/public-notifications/unread',
      directPublic: '/public-notifications',
      directPublicUnread: '/public-notifications/unread'
    },
    notificationModelsLoaded: !!require('./models/Notification'),
    controllersLoaded: {
      getNotifications: !!require('./controllers/notification/getNotifications'),
      getUnreadCount: !!require('./controllers/notification/getUnreadCount')
    }
  });
});

// Clerk Webhook endpoint (only apply webhook handler here)
app.post('/api/webhook', webhookHandler)

// Special debug routes for notifications
app.get('/debug-notifications', async (req, res) => {
  console.log('🟢 DEBUG: Direct access to /debug-notifications');
  console.log('   Query:', req.query);
  
  const { mongoUserId } = req.query;
  if (!mongoUserId) {
    return res.status(400).json({
      success: false,
      message: 'Missing mongoUserId parameter'
    });
  }
  
  try {
    const Notification = require('./models/Notification');
    const notifications = await Notification.find({ receiverId: mongoUserId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    return res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error in debug notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});

// RESTful debug route for notifications 
app.get('/api/user-notifications/:userId', async (req, res) => {
  console.log('🟢 DEBUG: RESTful access to /api/user-notifications/:userId');
  console.log('   Params:', req.params);
  
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Missing user ID parameter'
    });
  }
  
  try {
    const Notification = require('./models/Notification');
    const notifications = await Notification.find({ receiverId: userId })
      .populate('userId', '_id username profileImage')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    return res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error in RESTful notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});

// RESTful route for unread notifications count
app.get('/api/user-notifications/:userId/unread', async (req, res) => {
  console.log('🟢 DEBUG: RESTful access to /api/user-notifications/:userId/unread');
  console.log('   Params:', req.params);
  
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Missing user ID parameter'
    });
  }
  
  try {
    const Notification = require('./models/Notification');
    const unreadCount = await Notification.countDocuments({ 
      receiverId: userId,
      isRead: false
    });
    
    return res.status(200).json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error in RESTful unread count:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching unread notification count',
      error: error.message
    });
  }
});

// 404 handler
app.all('*', (req, res) => {
  console.log('❌ 404 Not Found:', {
    url: req.originalUrl,
    method: req.method,
    query: req.query,
    headers: {
      contentType: req.headers['content-type'],
      authorization: req.headers.authorization ? 'Bearer ...' : undefined
    }
  });
  res
    .status(404)
    .json({ 
      message: `${req.originalUrl} is not found on this server`,
      availableEndpoints: [
        '/api/notifications',
        '/api/notifications/unread',
        '/api/public-notifications',
        '/api/public-notifications/unread'
      ]
    })
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
