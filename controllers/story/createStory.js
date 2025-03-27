const Story = require('../../models/Story');
const User = require('../../models/User');
const mongoose = require('mongoose');

const createStory = async (req, res) => {
  try {
    console.log('📸 Creating new story');
    console.log('Request body keys:', Object.keys(req.body));
    
    const { image, caption, filters, userId } = req.body;
    
    // We'll prioritize using the MongoDB userId directly
    const authorId = userId;
    console.log('👤 Creating story for user ID:', authorId);

    // Check if we have a valid MongoDB user ID
    if (!authorId || !mongoose.Types.ObjectId.isValid(authorId)) {
      console.log('❌ Invalid MongoDB user ID:', authorId);
      return res.status(400).json({
        success: false,
        message: 'Valid MongoDB user ID is required'
      });
    }

    // Find user directly by MongoDB ID
    const user = await User.findById(authorId);
    
    if (!user) {
      console.log('❌ User not found for ID:', authorId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', {
      _id: user._id,
      username: user.username
    });

    // Validate image - with improved logging
    if (!image) {
      console.log('❌ No image provided in request');
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    // Log image data type and first characters (if string)
    if (typeof image === 'string') {
      console.log('✅ Image data received:', image.substring(0, 30) + '...');
    } else {
      console.log('✅ Image data type:', typeof image);
    }

    // Create story with the MongoDB user ID
    const story = new Story({
      author: user._id,
      image,
      caption,
      filters,
      viewers: [],
      likes: [],
      replies: [],
      duration: 24,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await story.save();
    console.log('✅ Story created successfully');

    // Populate author details for response
    await story.populate('author', 'username profileImg');

    return res.status(201).json({
      success: true,
      message: 'Story created successfully',
      story: {
        _id: story._id,
        author: {
          _id: story.author._id,
          username: story.author.username,
          avatar: story.author.profileImg
        },
        image: story.image,
        caption: story.caption,
        filters: story.filters,
        viewers: story.viewers,
        likes: story.likes,
        replies: story.replies,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt
      }
    });

  } catch (error) {
    console.error('❌ Error creating story:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating story',
      error: error.message
    });
  }
};

module.exports = createStory; 