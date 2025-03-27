const Story = require('../../models/Story');
const User = require('../../models/User');

const interactWithStory = async (req, res) => {
  try {
    console.log('👆 Story interaction request');
    const { id: storyId } = req.params;
    const { action, message } = req.body;
    const userId = req.userId; // From Clerk middleware

    console.log('🔄 Processing interaction:', {
      storyId,
      action,
      userId,
      hasMessage: !!message
    });

    // Find the current user using clerkId
    const user = await User.findOne({ clerkId: userId });
    if (!user) {
      console.log('❌ User not found for clerkId:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', {
      mongoId: user._id,
      username: user.username
    });

    // Find the story
    const story = await Story.findById(storyId);
    if (!story) {
      console.log('❌ Story not found');
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Check if story is expired
    if (story.isExpired()) {
      console.log('❌ Story has expired');
      return res.status(400).json({
        success: false,
        message: 'Story has expired'
      });
    }

    let result;
    switch (action) {
      case 'view':
        result = await story.addViewer(user._id);
        console.log('👀 Story viewed');
        break;

      case 'like':
        if (story.likes.includes(user._id)) {
          story.likes.pull(user._id);
          console.log('👎 Story unliked');
        } else {
          story.likes.push(user._id);
          console.log('👍 Story liked');
        }
        result = await story.save();
        break;

      case 'reply':
        if (!message) {
          return res.status(400).json({
            success: false,
            message: 'Reply message is required'
          });
        }
        story.replies.push({
          user: user._id,
          message
        });
        result = await story.save();
        console.log('💬 Reply added to story');
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action'
        });
    }

    return res.status(200).json({
      success: true,
      message: 'Story interaction successful',
      story: {
        _id: result._id,
        viewers: result.viewers,
        likes: result.likes,
        replies: result.replies
      }
    });

  } catch (error) {
    console.error('❌ Error in story interaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing story interaction',
      error: error.message
    });
  }
};

module.exports = interactWithStory;