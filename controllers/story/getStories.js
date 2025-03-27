const Story = require('../../models/Story');
const User = require('../../models/User');
const mongoose = require('mongoose');

const getStories = async (req, res) => {
  try {
    console.log('📱 Fetching stories feed');
    
    // Get userId either from query params or from the token
    const userId = req.query.userId || req.userId;
    console.log(`🔍 Finding stories for userId: ${userId}`);

    // Find current user - try both MongoDB ID and Clerk ID
    let currentUser;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      // If userId is a valid MongoDB ObjectId, search by _id
      currentUser = await User.findById(userId);
      console.log('🔍 Searched by MongoDB ID');
    } else {
      // Otherwise search by clerkId
      currentUser = await User.findOne({ clerkId: userId });
      console.log('🔍 Searched by Clerk ID');
    }

    if (!currentUser) {
      console.log('❌ User not found with id:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log('✅ User found:', {
      mongoId: currentUser._id,
      username: currentUser.username
    });

    // Get stories that haven't expired yet
    const stories = await Story.find({
      expiresAt: { $gt: new Date() }
    })
    .populate('author', 'username profileImg')
    .populate('viewers', 'username profileImg')
    .populate('likes', 'username profileImg')
    .populate('replies.user', 'username profileImg')
    .sort('-createdAt');

    if (!stories || stories.length === 0) {
      console.log('ℹ️ No active stories found');
      return res.status(200).json({
        success: true,
        message: 'No stories found',
        stories: []
      });
    }

    // Group stories by user
    const storyGroups = stories.reduce((groups, story) => {
      const authorId = story.author._id.toString();
      if (!groups[authorId]) {
        groups[authorId] = {
          user: {
            _id: story.author._id,
            username: story.author.username,
            avatar: story.author.profileImg,
            profileImg: story.author.profileImg
          },
          stories: []
        };
      }
      groups[authorId].stories.push({
        _id: story._id,
        author: {
          _id: story.author._id,
          username: story.author.username,
          avatar: story.author.profileImg,
          profileImg: story.author.profileImg
        },
        image: story.image,
        caption: story.caption,
        filters: story.filters,
        viewers: story.viewers,
        likes: story.likes,
        replies: story.replies,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt
      });
      return groups;
    }, {});

    console.log(`✅ Found ${Object.keys(storyGroups).length} story groups`);
    return res.status(200).json({
      success: true,
      message: 'Stories fetched successfully',
      stories: Object.values(storyGroups)
    });

  } catch (error) {
    console.error('❌ Error fetching stories:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching stories',
      error: error.message
    });
  }
};

module.exports = getStories; 