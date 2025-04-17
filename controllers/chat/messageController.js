const User = require('../../models/User');
const Message = require('../../models/Message');
const PrivateChat = require('../../models/PrivateChat');
const ChatGroup = require('../../models/ChatGroup');
const ChatNotification = require('../../models/ChatNotification');

/**
 * Fix attachment URLs by removing client-side properties but keeping the original URL
 */
const fixAttachmentUrls = (attachments = []) => {
  // If no attachments or empty array, return as is
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return attachments;
  }
  
  return attachments.map(att => {
    // Skip if no URL or it's not a string
    if (!att.url || typeof att.url !== 'string') {
      return att;
    }
    
    // Debug log to verify the URL is preserved
    console.log(`📎 IMPORTANT DEBUG: Original URL before processing: ${att.url}`);
    
    // ENSURE we are not modifying the URL - absolutely no IP address replacement
    
    // Debug log after (should be identical to before)
    console.log(`📎 IMPORTANT DEBUG: Final URL after processing: ${att.url}`);
    
    return {
      ...att,
      url: att.url // Keep the exact original URL
    };
  });
};

/**
 * Send a message in a chat (private or group)
 */
const sendMessage = async (req, res) => {
  try {
    console.log('💬 Sending message');
    const { chatId, chatType, text = '', attachments = [] } = req.body;
    
    if (!chatId || !chatType) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID and chat type are required'
      });
    }
    
    // Check if message has either text or attachments
    if (!text && (!attachments || attachments.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Message must contain either text or attachments'
      });
    }
    
    if (!['private', 'group'].includes(chatType)) {
      return res.status(400).json({
        success: false,
        message: 'Chat type must be "private" or "group"'
      });
    }
    
    // Get MongoDB user
    const user = await User.findById(req.userId);
    if (!user) {
      console.log('❌ User not found for MongoDB ID:', req.userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const mongoUserId = user._id;
    
    // Handle based on chat type
    if (chatType === 'private') {
      // Find the private chat
      const chat = await PrivateChat.findOne({
        _id: chatId,
        participants: mongoUserId,
        isActive: true
      });
      
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found or you are not a participant'
        });
      }
      
      // Get the other participant
      const recipientId = chat.participants.find(
        id => id.toString() !== mongoUserId.toString()
      );
      
      if (!recipientId) {
        return res.status(400).json({
          success: false,
          message: 'Could not determine recipient'
        });
      }
      
      // Check if user is blocked
      if (chat.isBlocked(recipientId)) {
        return res.status(403).json({
          success: false,
          message: 'You cannot send messages to this user'
        });
      }
      
      // Create message
      const message = new Message({
        sender: mongoUserId,
        recipient: recipientId,
        text,
        chatType: 'private',
        participants: chat.participants,
        attachments: fixAttachmentUrls(attachments).map(att => ({
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size
        })),
        readBy: [{ user: mongoUserId, readAt: new Date() }]
      });
      
      await message.save();
      
      // Update last message in chat
      chat.lastMessage = {
        text,
        sender: mongoUserId,
        sentAt: new Date()
      };
      await chat.save();
      
      // Populate sender info
      await message.populate('sender', '_id username profileImg');
      
      // Create notification for recipient
      const notification = new ChatNotification({
        recipient: recipientId,
        type: 'new_message',
        sender: mongoUserId,
        message: message._id,
        chat: {
          id: chat._id,
          model: 'PrivateChat'
        },
        content: {
          text: `${user.username} sent you a message`,
          preview: text.length > 50 ? `${text.substring(0, 50)}...` : text
        }
      });
      await notification.save();
      
      console.log('✅ Private message sent');
      return res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          _id: message._id,
          sender: {
            _id: message.sender._id,
            username: message.sender.username,
            profileImg: message.sender.profileImg
          },
          text: message.text,
          attachments: message.attachments,
          createdAt: message.createdAt,
          chatId: chat._id,
          chatType: 'private'
        }
      });
    } else {
      // Find the group chat
      const group = await ChatGroup.findOne({
        _id: chatId,
        'members.user': mongoUserId,
        isActive: true
      });
      
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found or you are not a member'
        });
      }
      
      // Check if user has permission to send messages
      const userMember = group.members.find(member => member.user.toString() === mongoUserId.toString());
      const canSendMessages = 
        userMember.role === 'admin' || 
        group.settings.sendMessages === 'all_members';
      
      if (!canSendMessages) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to send messages in this group'
        });
      }
      
      // Get member IDs for participants
      const memberIds = group.members.map(member => member.user);
      
      // Create message
      const message = new Message({
        sender: mongoUserId,
        group: chatId,
        text,
        chatType: 'group',
        participants: memberIds,
        attachments: fixAttachmentUrls(attachments).map(att => ({
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size
        })),
        readBy: [{ user: mongoUserId, readAt: new Date() }]
      });
      
      await message.save();
      
      // Update last message in group
      group.lastMessage = {
        text,
        sender: mongoUserId,
        sentAt: new Date()
      };
      await group.save();
      
      // Populate sender info
      await message.populate('sender', '_id username profileImg');
      
      // Create notifications for other members
      for (const memberId of memberIds) {
        // Skip the sender
        if (memberId.toString() === mongoUserId.toString()) continue;
        
        const notification = new ChatNotification({
          recipient: memberId,
          type: 'new_message',
          sender: mongoUserId,
          message: message._id,
          chat: {
            id: group._id,
            model: 'ChatGroup',
            name: group.name
          },
          content: {
            text: `${user.username} sent a message in ${group.name}`,
            preview: text.length > 50 ? `${text.substring(0, 50)}...` : text
          }
        });
        await notification.save();
      }
      
      console.log('✅ Group message sent');
      return res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          _id: message._id,
          sender: {
            _id: message.sender._id,
            username: message.sender.username,
            profileImg: message.sender.profileImg
          },
          text: message.text,
          attachments: message.attachments,
          createdAt: message.createdAt,
          chatId: group._id,
          chatType: 'group'
        }
      });
    }
  } catch (error) {
    console.error('❌ Error sending message:', error);
    return res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
};

/**
 * Mark a message as read
 */
const markAsRead = async (req, res) => {
  try {
    console.log('📖 Marking message as read');
    const { messageId } = req.params;
    
    // Get MongoDB user
    const user = await User.findById(req.userId);
    if (!user) {
      console.log('❌ User not found for MongoDB ID:', req.userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const mongoUserId = user._id;
    
    // Find the message
    const message = await Message.findOne({
      _id: messageId,
      participants: mongoUserId
    });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you are not a participant'
      });
    }
    
    // Check if already read by this user
    const alreadyRead = message.readBy.some(read => read.user.toString() === mongoUserId.toString());
    
    if (!alreadyRead) {
      // Add user to readBy list
      message.readBy.push({
        user: mongoUserId,
        readAt: new Date()
      });
      await message.save();
    }
    
    console.log('✅ Message marked as read');
    return res.status(200).json({
      success: true,
      message: 'Message marked as read',
      messageId
    });
  } catch (error) {
    console.error('❌ Error marking message as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Error marking message as read',
      error: error.message
    });
  }
};

/**
 * Mark all messages in a chat as read
 */
const markAllAsRead = async (req, res) => {
  try {
    console.log('📖 Marking all messages as read');
    const { chatId, chatType } = req.body;
    
    if (!chatId || !chatType) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID and chat type are required'
      });
    }
    
    if (!['private', 'group'].includes(chatType)) {
      return res.status(400).json({
        success: false,
        message: 'Chat type must be "private" or "group"'
      });
    }
    
    // Get MongoDB user
    const user = await User.findById(req.userId);
    if (!user) {
      console.log('❌ User not found for MongoDB ID:', req.userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const mongoUserId = user._id;
    
    // Verify user is in this chat
    let chat;
    if (chatType === 'private') {
      chat = await PrivateChat.findOne({
        _id: chatId,
        participants: mongoUserId,
        isActive: true
      });
    } else {
      chat = await ChatGroup.findOne({
        _id: chatId,
        'members.user': mongoUserId,
        isActive: true
      });
    }
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found or you are not a participant'
      });
    }
    
    // Get all unread messages in this chat
    const query = {
      chatType,
      participants: mongoUserId,
      'readBy.user': { $ne: mongoUserId }
    };
    
    if (chatType === 'private') {
      query.$or = [
        { sender: mongoUserId },
        { recipient: mongoUserId }
      ];
    } else {
      query.group = chatId;
    }
    
    // Find all messages and update them
    const updateResult = await Message.updateMany(
      query,
      {
        $push: {
          readBy: {
            user: mongoUserId,
            readAt: new Date()
          }
        }
      }
    );
    
    // Also update the chat's last read timestamp
    if (chatType === 'private') {
      const userStatus = chat.participantStatus.find(
        status => status.user.toString() === mongoUserId.toString()
      );
      
      if (userStatus) {
        userStatus.lastRead = new Date();
        await chat.save();
      }
    } else {
      const memberIndex = chat.members.findIndex(
        member => member.user.toString() === mongoUserId.toString()
      );
      
      if (memberIndex !== -1) {
        chat.members[memberIndex].lastRead = new Date();
        await chat.save();
      }
    }
    
    // Also mark notifications as read
    await ChatNotification.markAllAsReadForChat(mongoUserId, chatId, chatType === 'private' ? 'PrivateChat' : 'ChatGroup');
    
    console.log(`✅ Marked ${updateResult.modifiedCount} messages as read`);
    return res.status(200).json({
      success: true,
      message: `Marked ${updateResult.modifiedCount} messages as read`,
      count: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Error marking messages as read',
      error: error.message
    });
  }
};

/**
 * Delete a message
 */
const deleteMessage = async (req, res) => {
  try {
    console.log('🗑️ Deleting message');
    const { messageId } = req.params;
    
    // Get MongoDB user
    const user = await User.findById(req.userId);
    if (!user) {
      console.log('❌ User not found for MongoDB ID:', req.userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const mongoUserId = user._id;
    
    // Find the message
    const message = await Message.findById(messageId);
    
    if (!message) {
      console.log('❌ Message not found:', messageId);
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Check if user is the sender of the message
    if (message.sender.toString() !== mongoUserId.toString()) {
      console.log('❌ Unauthorized: User is not the sender of this message');
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }
    
    // Delete the message
    await Message.findByIdAndDelete(messageId);
    
    // If this was the last message in a chat, update the lastMessage field
    if (message.chatType === 'private') {
      // Find all participants in this message
      const participants = message.participants;
      
      // Find the most recent message in this chat
      const lastMessage = await Message.findOne({
        participants: { $all: participants },
        _id: { $ne: messageId }
      }).sort({ createdAt: -1 });
      
      if (lastMessage) {
        // Find the private chat
        const privateChat = await PrivateChat.findOne({
          participants: { $all: participants },
          isActive: true
        });
        
        if (privateChat) {
          // Update last message
          privateChat.lastMessage = {
            text: lastMessage.text,
            sender: lastMessage.sender,
            sentAt: lastMessage.createdAt
          };
          
          await privateChat.save();
        }
      }
    } else if (message.chatType === 'group') {
      // Find the most recent message in this group
      const lastMessage = await Message.findOne({
        group: message.group,
        _id: { $ne: messageId }
      }).sort({ createdAt: -1 });
      
      if (lastMessage) {
        // Find the group chat
        const groupChat = await ChatGroup.findById(message.group);
        
        if (groupChat) {
          // Update last message
          groupChat.lastMessage = {
            text: lastMessage.text,
            sender: lastMessage.sender,
            sentAt: lastMessage.createdAt
          };
          
          await groupChat.save();
        }
      }
    }
    
    console.log('✅ Message deleted');
    return res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting message:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting message',
      error: error.message
    });
  }
};

module.exports = {
  sendMessage,
  markAsRead,
  markAllAsRead,
  deleteMessage
}; 