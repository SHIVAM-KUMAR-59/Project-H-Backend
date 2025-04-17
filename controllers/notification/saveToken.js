const User = require('../../models/User')

const saveToken = async (req, res) => {
  try {
    const { pushNotificationToken } = req.body
    const { mongoUserId } = req.query

    if (!pushNotificationToken) {
      return res.status(400).json({
        success: false,
        message: 'Expo Notification Token is required.',
      })
    }

    // Determine user ID from either authenticated user or query parameter
    let userId = req.user?._id
    
    // If no authenticated user but mongoUserId is provided in query params
    if (!userId && mongoUserId) {
      userId = mongoUserId
    }
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required. Either authenticate or provide mongoUserId.',
      })
    }

    // Find user and update their pushNotificationToken
    const user = await User.findByIdAndUpdate(
      userId,
      { pushNotificationToken },
      { new: true },
    )

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Expo Notification Token saved successfully.',
      user,
    })
  } catch (error) {
    console.error('Error saving Expo Notification Token:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    })
  }
}

module.exports = { saveToken }
