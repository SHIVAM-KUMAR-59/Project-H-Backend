const Story = require('../../models/Story');
const User = require('../../models/User');
const mongoose = require('mongoose');

const deleteStory = async (req, res) => {
  try {
    const storyId = req.params.id;
    console.log(`🗑️ Attempting to delete story with ID: ${storyId}`);
    
    // Check for MongoDB user ID in query params first (direct approach)
    let mongoUserId = req.query.mongoUserId;
    let user = null;

    if (!mongoUserId) {
      // Fallback to getting MongoDB user ID from Clerk ID
      const clerkId = req.userId;
      console.log('ℹ️ No direct MongoDB ID provided, using Clerk ID:', clerkId);
      
      // Find the MongoDB user associated with this Clerk ID
      user = await User.findOne({ clerkId });
      
      if (!user) {
        console.log('❌ MongoDB user not found for Clerk ID:', clerkId);
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      mongoUserId = user._id;
    }

    // Find the story
    const story = await Story.findById(storyId);
    
    if (!story) {
      console.log('❌ Story not found with ID:', storyId);
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }
    
    // Compare the story's author ID with the MongoDB user ID
    if (story.author.toString() !== mongoUserId.toString()) {
      console.log('⛔ Unauthorized deletion attempt');
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this story'
      });
    }
    
    // If we get here, user is authorized to delete the story
    console.log('✅ User authorized to delete story');
    
    // Perform the deletion
    await Story.findByIdAndDelete(storyId);
    
    console.log('✅ Story deleted successfully');
    return res.status(200).json({
      success: true,
      message: 'Story deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting story:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting story',
      error: error.message
    });
  }
};

module.exports = deleteStory; 