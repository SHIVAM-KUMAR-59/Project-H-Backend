const User = require('../../models/User')

const discoverPeople = async (req, res) => {
  try {
    console.log('\n🔍 DISCOVER PEOPLE ENDPOINT HIT')

    // Get the current user's ID from the request
    const currentUserId = req.userId
    console.log('👤 Current user ID:', currentUserId)

    // Check if this is the '/suggested' route vs. a specific user ID route
    const isSuggestedRoute =
      req.path === '/suggested' || req.route.path === '/suggested'
    console.log('📍 Full route path:', req.originalUrl)
    console.log('📍 Route path:', req.path)
    console.log('📍 Is suggested route:', isSuggestedRoute)

    // Handle parameter for discover/:id route
    const targetUserId = req.params.id
    console.log(
      '📍 Target user ID parameter:',
      targetUserId || 'none (suggested route)',
    )

    // Debug: Log the MongoDB connection state
    console.log('MongoDB connection state:', User.db.readyState)


    // Get all users except the current user
    const allUsers = await User.find({ clerkId: { $ne: currentUserId } }).limit(20)
    console.log('📊 Raw MongoDB users count:', allUsers.length)

    // Basic transformation
    const suggestedUsers = allUsers.map(user => ({
      _id: user._id,
      username: user.username,
      profileImg: user.profileImg,
      bio: user.bio || `Hi, I'm ${user.username}!`,
      email: user.email,
      isFollowing: false // Default to false, would need another query to determine true status
    }))

    console.log('✅ Found users:', suggestedUsers.length)
    console.log(
      '✅ Found users details:',
      suggestedUsers.map((u) => ({
        id: u._id,
        username: u.username,
        email: u.email,
      }))
    )

    return res.status(200).json({
      success: true,
      message: 'Users found',
      users: suggestedUsers
    })
    
  } catch (error) {
    console.error('❌ Error in discoverPeople:', error)
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message
// =======
//     try {
//       // Get all users except the current user
//       const allUsers = await User.find({
//         clerkId: { $ne: currentUserId },
//       }).limit(20)
//       console.log('📊 Raw MongoDB users count:', allUsers.length)

//       // Basic transformation
//       const suggestedUsers = allUsers.map((user) => ({
//         _id: user._id,
//         username: user.username,
//         profileImg: user.profileImg,
//         bio: user.bio || `Hi, I'm ${user.username}!`,
//         isFollowing: false, // Default to false, would need another query to determine true status
//       }))

//       console.log('✅ Found users:', suggestedUsers.length)
//       return res.status(200).json({
//         success: true,
//         users: suggestedUsers,
//       })
//     } catch (dbError) {
//       console.error('❌ Database error:', dbError)
//       return res.status(500).json({
//         success: false,
//         message: 'Error fetching users from database',
//         error: dbError.message,
//       })
//     }
//   } catch (error) {
//     console.error('❌ Error in discoverPeople:', error)
//     return res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message,
// >>>>>>> main
    })
  }
}

module.exports = discoverPeople
