const express = require('express')
const router = express.Router()

// Routes
router.use('/api/auth', require('../routes/auth'))
router.use('/api/posts', require('../routes/post'))
// router.use('/api/jobs', require('../routes/job'))
router.use('/api/users', require('../routes/user'))
router.use('/api/comments', require('../routes/comment'))
router.use('/api/clerk', require('../routes/clerk'))

module.exports = router
