const Notification = require('../../models/Notification')
const mongoose = require('mongoose')

const getNotifications = async (req, res) => {
  try {
    // Get the user ID from the request
    // First check if it came from auth middleware
    let userId = req.user?._id
    
    // If not available from middleware, check query parameters
    if (!userId && req.query.mongoUserId) {
      if (mongoose.Types.ObjectId.isValid(req.query.mongoUserId)) {
        userId = req.query.mongoUserId
        console.log('🔍 Using mongoUserId from query:', userId)
      } else {
        console.log('❌ Invalid mongoUserId in query')
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID provided'
        })
      }
    }
    
    // If still no userId, return error
    if (!userId) {
      console.log('❌ No user ID available')
      return res.status(400).json({
        success: false,
        message: 'No user ID provided'
      })
    }
    
    const { unread } = req.query

    const filter = { receiverId: userId }
    if (unread === 'true') {
      filter.isRead = false
    }

    console.log('🔍 Fetching notifications with filter:', filter)

    const notifications = await Notification.find(filter)
      .populate('userId', '_id username profileImage')
      .sort({ createdAt: -1 }) // Latest notifications first
      .lean()

    console.log(`✅ Found ${notifications.length} notifications`)

    return res.status(200).json({
      success: true,
      data: notifications
    })
  } catch (error) {
    console.error('❌ Error fetching notifications:', error)
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    })
  }
}

module.exports = getNotifications
