const Notification = require('../../models/Notification')
const mongoose = require('mongoose')

const getUnreadCount = async (req, res) => {
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

    console.log('🔍 Counting unread notifications for user:', userId)
    
    const unreadCount = await Notification.countDocuments({ 
      receiverId: userId, 
      isRead: false 
    })

    console.log('✅ Found unread notifications:', unreadCount)
    
    return res.status(200).json({
      success: true,
      data: {
        unreadCount
      }
    })
  } catch (error) {
    console.error('❌ Error fetching unread notifications count:', error)
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    })
  }
}

module.exports = getUnreadCount 