const User = require('../../models/User');
const Message = require('../../models/Message');
const PrivateChat = require('../../models/PrivateChat');
const ChatGroup = require('../../models/ChatGroup');
const ChatNotification = require('../../models/ChatNotification');
const mongoose = require('mongoose');

/**
 * Get messages for a specific chat (private or group)
 */
const getChatMessages = async (req, res) => {
  try {
    console.log('📥 Getting chat messages');
    const { chatId } = req.params;
    const { chatType } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
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
    
    // Query for messages
    const query = { chatType };
    
    if (chatType === 'private') {
      query.$or = [
        { sender: mongoUserId, recipient: { $exists: true } },
        { recipient: mongoUserId, sender: { $exists: true } }
      ];
      
      // For private chat, we need to filter to just this conversation
      // Get the other participant
      const otherParticipantId = chat.participants.find(
        p => p.toString() !== mongoUserId.toString()
      );
      
      if (otherParticipantId) {
        query.$or = [
          { sender: mongoUserId, recipient: otherParticipantId },
          { recipient: mongoUserId, sender: otherParticipantId }
        ];
      }
    } else {
      query.group = chatId;
    }
    
    // Get messages with pagination
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', '_id username profileImg')
      .populate('readBy.user', '_id username');
    
    // Count total messages for pagination
    const totalMessages = await Message.countDocuments(query);
    
    // Mark messages as read
    const unreadMessageIds = messages
      .filter(msg => 
        !msg.readBy.some(r => r.user._id.toString() === mongoUserId.toString())
      )
      .map(msg => msg._id);
    
    if (unreadMessageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessageIds } },
        {
          $push: {
            readBy: {
              user: mongoUserId,
              readAt: new Date()
            }
          }
        }
      );
      
      // Update the last read time in the chat
      if (chatType === 'private') {
        const statusIndex = chat.participantStatus.findIndex(
          status => status.user.toString() === mongoUserId.toString()
        );
        
        if (statusIndex !== -1) {
          chat.participantStatus[statusIndex].lastRead = new Date();
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
      
      // Mark notifications as read
      await ChatNotification.markAllAsReadForChat(
        mongoUserId, 
        chatId, 
        chatType === 'private' ? 'PrivateChat' : 'ChatGroup'
      );
    }
    
    // Format messages for response
    const formattedMessages = messages.map(message => ({
      _id: message._id,
      text: message.text,
      sender: {
        _id: message.sender._id,
        username: message.sender.username,
        profileImg: message.sender.profileImg
      },
      isMine: message.sender._id.toString() === mongoUserId.toString(),
      attachments: message.attachments,
      readBy: message.readBy.map(r => ({
        _id: r.user._id,
        username: r.user.username,
        readAt: r.readAt
      })),
      createdAt: message.createdAt
    }));
    
    console.log(`✅ Found ${messages.length} messages`);
    return res.status(200).json({
      success: true,
      data: {
        messages: formattedMessages,
        unreadCount: unreadMessageIds.length,
        pagination: {
          total: totalMessages,
          page,
          limit,
          pages: Math.ceil(totalMessages / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting chat messages:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting chat messages',
      error: error.message
    });
  }
};

/**
 * Get all chats (both private and group) for the current user
 */
const getAllChats = async (req, res) => {
  try {
    console.log('📋 Getting all chats');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
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
    
    // Find all private chats
    const privateChats = await PrivateChat.find({
      participants: mongoUserId,
      isActive: true
    }).populate('participants', '_id username profileImg');
    
    // Find all group chats
    const groupChats = await ChatGroup.find({
      'members.user': mongoUserId,
      isActive: true
    }).populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    // Format private chats
    const formattedPrivateChats = privateChats.map(chat => {
      // Get the other participant
      const otherParticipant = chat.participants.find(
        participant => participant._id.toString() !== mongoUserId.toString()
      );
      
      // Get user status
      const userStatus = chat.participantStatus.find(
        status => status.user.toString() === mongoUserId.toString()
      );
      
      // Get other participant status
      const otherStatus = chat.participantStatus.find(
        status => status.user.toString() === otherParticipant._id.toString()
      );
      
      return {
        _id: chat._id,
        type: 'private',
        name: otherParticipant.username,
        avatar: otherParticipant.profileImg,
        participants: [
          {
            _id: user._id,
            username: user.username,
            profileImg: user.profileImg
          },
          {
            _id: otherParticipant._id,
            username: otherParticipant.username,
            profileImg: otherParticipant.profileImg
          }
        ],
        lastMessage: chat.lastMessage,
        isBlocked: userStatus ? userStatus.isBlocked : false,
        blockedBy: otherStatus && otherStatus.isBlocked,
        createdAt: chat.createdAt
      };
    });
    
    // Format group chats
    const formattedGroupChats = groupChats.map(group => {
      // Log to debug the members
      console.log(`📊 Processing group ${group.name} with ${group.members.length} members`);
      group.members.forEach(member => {
        console.log(`- Member: ${member.user.username} (${member.user._id}), Role: ${member.role}`);
      });

      return {
        _id: group._id,
        type: 'group',
        name: group.name,
        description: group.description,
        avatar: group.avatar || null,
        participants: group.members.map(member => ({
          _id: member.user._id,
          username: member.user.username,
          profileImg: member.user.profileImg,
          role: member.role
        })),
        members: group.members.map(member => ({
          _id: member.user._id,
          username: member.user.username,
          profileImg: member.user.profileImg,
          role: member.role
        })),
        memberCount: group.members.length,
        lastMessage: group.lastMessage,
        createdAt: group.createdAt
      };
    });
    
    // Combine and sort by last message time (most recent first)
    const allChats = [...formattedPrivateChats, ...formattedGroupChats]
      .sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.sentAt).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.sentAt).getTime() : 0;
        return timeB - timeA;
      })
      .slice(skip, skip + limit);
    
    const totalChats = formattedPrivateChats.length + formattedGroupChats.length;
    
    // Count unread messages across all chats
    const unreadQuery = {
      participants: mongoUserId,
      'readBy.user': { $ne: mongoUserId }
    };
    
    const unreadCount = await Message.countDocuments(unreadQuery);
    
    // Get unread notifications
    const unreadNotifications = await ChatNotification.countDocuments({
      recipient: mongoUserId,
      isRead: false
    });
    
    console.log(`✅ Found ${allChats.length} chats`);
    return res.status(200).json({
      success: true,
      data: {
        chats: allChats,
        unreadCount,
        unreadNotifications,
        pagination: {
          total: totalChats,
          page,
          limit,
          pages: Math.ceil(totalChats / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting all chats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting all chats',
      error: error.message
    });
  }
};

/**
 * Get unread message count
 */
const getUnreadCount = async (req, res) => {
  try {
    console.log('🔢 Getting unread count');
    
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
    
    // Count unread messages
    const unreadQuery = {
      participants: mongoUserId,
      'readBy.user': { $ne: mongoUserId }
    };
    
    const unreadCount = await Message.countDocuments(unreadQuery);
    
    // Count unread notifications
    const unreadNotifications = await ChatNotification.countDocuments({
      recipient: mongoUserId,
      isRead: false
    });
    
    const total = unreadCount + unreadNotifications;
    
    console.log(`✅ Found ${unreadCount} unread messages and ${unreadNotifications} unread notifications`);
    return res.status(200).json({
      success: true,
      data: {
        unreadMessages: unreadCount,
        unreadNotifications,
        total: total,
        unreadCount: total
      }
    });
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting unread count',
      error: error.message
    });
  }
};

/**
 * Search for chats and messages
 */
const searchChats = async (req, res) => {
  try {
    console.log('🔍 Searching chats and messages');
    const { query } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
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
    
    // Search in private chats (other user's username)
    const privateChats = await PrivateChat.find({
      participants: mongoUserId,
      isActive: true
    }).populate({
      path: 'participants',
      match: { 
        username: { $regex: query, $options: 'i' },
        _id: { $ne: mongoUserId }
      },
      select: '_id username profileImg'
    });
    
    // Filter out chats where the other participant didn't match the search query
    const matchedPrivateChats = privateChats.filter(chat => 
      chat.participants.some(p => p._id.toString() !== mongoUserId.toString())
    );
    
    // Search in group chats (group name or description)
    const groupChats = await ChatGroup.find({
      'members.user': mongoUserId,
      isActive: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    }).populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    // Search in messages
    const messages = await Message.find({
      participants: mongoUserId,
      text: { $regex: query, $options: 'i' }
    })
    .populate('sender', '_id username profileImg')
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Format search results
    const formattedPrivateChats = matchedPrivateChats.map(chat => {
      const otherParticipant = chat.participants.find(
        p => p._id.toString() !== mongoUserId.toString()
      );
      
      return {
        _id: chat._id,
        type: 'private',
        name: otherParticipant.username,
        avatar: otherParticipant.profileImg,
        lastMessage: chat.lastMessage,
        matchType: 'contact'
      };
    });
    
    const formattedGroupChats = groupChats.map(group => {
      return {
        _id: group._id,
        type: 'group',
        name: group.name,
        description: group.description,
        memberCount: group.members.length,
        lastMessage: group.lastMessage,
        matchType: 'group'
      };
    });
    
    const formattedMessages = messages.map(msg => {
      // Determine if this is a private or group message
      const chatType = msg.chatType;
      let chatId, chatName;
      
      if (chatType === 'private') {
        chatId = msg.recipient ? msg.recipient.toString() : null;
        // We'd need to query to get the username, but for simplicity just marking as private chat
        chatName = 'Private Chat';
      } else {
        chatId = msg.group ? msg.group.toString() : null;
        chatName = 'Group Chat';
      }
      
      return {
        _id: msg._id,
        text: msg.text,
        sender: {
          _id: msg.sender._id,
          username: msg.sender.username,
          profileImg: msg.sender.profileImg
        },
        preview: msg.text.length > 60 ? `${msg.text.substring(0, 60)}...` : msg.text,
        createdAt: msg.createdAt,
        chatId,
        chatName,
        chatType,
        matchType: 'message'
      };
    });
    
    // Combine all results
    const results = [
      ...formattedPrivateChats,
      ...formattedGroupChats,
      ...formattedMessages
    ];
    
    console.log(`✅ Found ${results.length} search results`);
    return res.status(200).json({
      success: true,
      data: {
        results,
        contacts: formattedPrivateChats.length,
        groups: formattedGroupChats.length,
        messages: formattedMessages.length,
        total: results.length
      }
    });
  } catch (error) {
    console.error('❌ Error searching chats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error searching chats',
      error: error.message
    });
  }
};

module.exports = {
  getChatMessages,
  getAllChats,
  getUnreadCount,
  searchChats
}; 