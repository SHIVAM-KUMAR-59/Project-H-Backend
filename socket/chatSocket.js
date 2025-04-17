const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const PrivateChat = require('../models/PrivateChat');
const ChatGroup = require('../models/ChatGroup');
const UserPresence = require('../models/UserPresence');
const ChatNotification = require('../models/ChatNotification');

// Store active users and their socket connections
const activeUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId

// Store user typing status
const typingUsers = new Map(); // chatId -> [userId]

// Function to set up the Socket.io server
function setupSocketServer(server) {
  // Create Socket.io server with CORS configuration
  const io = socketIo(server, {
    cors: {
      origin: '*', // In production, specify your app's domain
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Socket.io middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Store user info in the socket object
      socket.userId = decoded.userId;
      
      // Find user by MongoDB ID directly
      const user = await User.findById(decoded.userId).select('_id username profileImg');
      if (!user) {
        console.log(`❌ Socket connection rejected: User not found for MongoDB ID ${decoded.userId}`);
        return next(new Error('Authentication error: User not found'));
      }
      
      socket.user = {
        _id: user._id.toString(),
        username: user.username,
        profileImg: user.profileImg
      };
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle socket connections
  io.on('connection', async (socket) => {
    const userId = socket.user._id;
    const username = socket.user.username;
    
    console.log(`🔌 Socket connected: ${username} (${userId})`);
    
    // Add user to active users
    activeUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);
    
    // Update user presence in database
    let presence = await UserPresence.findOne({ user: userId });
    if (!presence) {
      // Create new presence record if doesn't exist
      presence = new UserPresence({
        user: userId,
        status: 'online',
        lastActive: new Date(),
        socketId: socket.id,
        device: {
          type: socket.handshake.query.deviceType || 'unknown',
          os: socket.handshake.query.os,
          browser: socket.handshake.query.browser,
          appVersion: socket.handshake.query.appVersion
        }
      });
    } else {
      // Update existing presence record
      presence.status = 'online';
      presence.lastActive = new Date();
      presence.socketId = socket.id;
      if (socket.handshake.query.deviceType) {
        presence.device = {
          type: socket.handshake.query.deviceType,
          os: socket.handshake.query.os,
          browser: socket.handshake.query.browser,
          appVersion: socket.handshake.query.appVersion
        };
      }
    }
    await presence.save();
    
    // Broadcast user online status to all connected users
    socket.broadcast.emit('user:online', { 
      userId, 
      username,
      avatar: socket.user.profileImg,
      timestamp: new Date()
    });
    
    // Send the currently online users to the newly connected user
    const onlineUserPresences = await UserPresence.find({
      status: { $ne: 'offline' },
      'privacySettings.showOnlineStatus': true
    }).populate('user', '_id username profileImg');
    
    const onlineUsers = onlineUserPresences.map(presence => ({
      userId: presence.user._id,
      username: presence.user.username,
      avatar: presence.user.profileImg,
      status: presence.status,
      lastActive: presence.lastActive
    }));
    
    socket.emit('users:online', onlineUsers);
    
    // ===== PRIVATE CHAT HANDLERS =====
    
    // Join a private chat room with another user
    socket.on('private:join', async ({ recipientId }) => {
      try {
        // Create a unique room ID for the two users (sorted to ensure consistency)
        const participants = [userId, recipientId].sort();
        const roomId = `private:${participants.join('-')}`;
        
        console.log(`👥 User ${username} joined private chat: ${roomId}`);
        
        // Leave all other private rooms first
        Array.from(socket.rooms)
          .filter(room => room !== socket.id && room.startsWith('private:'))
          .forEach(room => socket.leave(room));
        
        // Join the new private room
        socket.join(roomId);
        
        // Check if chat exists in database or create new one
        let chat = await PrivateChat.findOne({
          participants: { $all: [userId, recipientId] },
          isActive: true
        });
        
        if (!chat) {
          // Create new chat
          chat = new PrivateChat({
            participants: [userId, recipientId],
            participantStatus: [
              { user: userId, lastRead: new Date() },
              { user: recipientId, lastRead: new Date() }
            ]
          });
          await chat.save();
          console.log(`✅ Created new private chat between ${userId} and ${recipientId}`);
        }
        
        // Update last read timestamp for current user
        const userStatus = chat.participantStatus.find(
          status => status.user.toString() === userId
        );
        if (userStatus) {
          userStatus.lastRead = new Date();
          await chat.save();
        }
        
        // Return the room ID and chat ID to the client
        socket.emit('private:joined', { 
          roomId,
          chatId: chat._id
        });
      } catch (error) {
        console.error('Error joining private chat:', error);
        socket.emit('error', { message: 'Failed to join private chat' });
      }
    });
    
    // Send a private message
    socket.on('private:message', async ({ roomId, recipientId, text, chatId, attachments = [] }) => {
      try {
        if (!roomId || !text || !recipientId || !chatId) {
          return socket.emit('error', { message: 'Invalid message data' });
        }
        
        console.log(`💬 Private message from ${username} in ${roomId}: ${text.substring(0, 20)}...`);
        
        // Find chat record
        const chat = await PrivateChat.findById(chatId);
        if (!chat) {
          return socket.emit('error', { message: 'Chat not found' });
        }
        
        // Check if user is blocked
        if (chat.isBlocked(recipientId)) {
          return socket.emit('error', { message: 'You cannot send messages to this user' });
        }
        
        // Create message in database
        const message = new Message({
          sender: userId,
          recipient: recipientId,
          text,
          chatType: 'private',
          participants: [userId, recipientId],
          attachments: attachments.map(att => {
            // Log the attachment URLs to debug
            if (att.url) {
              console.log(`SOCKET DEBUG: Original private message URL: ${att.url}`);
            }
            
            // Don't modify the URL - keep the original URL
            return {
              type: att.type,
              url: att.url, // Keep the original URL without modification
              name: att.name,
              size: att.size
            };
          }),
          readBy: [{ user: userId, readAt: new Date() }]
        });
        
        await message.save();
        
        // Update last message in chat
        chat.lastMessage = {
          text,
          sender: userId,
          sentAt: new Date()
        };
        await chat.save();
        
        // Populate sender info
        await message.populate('sender', '_id username profileImg');
        
        // Create formatted message for the client
        const formattedMessage = {
          _id: message._id,
          sender: {
            _id: message.sender._id,
            username: message.sender.username,
            profileImg: message.sender.profileImg
          },
          text: message.text,
          attachments: message.attachments,
          createdAt: message.createdAt,
          chatId: chat._id
        };
        
        // Send to the room (both sender and recipient if online)
        io.to(roomId).emit('private:message', formattedMessage);
        
        // Clear typing indicator when message is sent
        handleTypingStop({ roomId, userId });
        
        // Send notification to recipient if they're not in the room
        const recipientSocketId = activeUsers.get(recipientId);
        if (recipientSocketId) {
          const recipientSocket = io.sockets.sockets.get(recipientSocketId);
          if (recipientSocket && !recipientSocket.rooms.has(roomId)) {
            // Create notification in database
            const notification = new ChatNotification({
              recipient: recipientId,
              type: 'new_message',
              sender: userId,
              message: message._id,
              chat: {
                id: chat._id,
                model: 'PrivateChat'
              },
              content: {
                text: `${username} sent you a message`,
                preview: text.length > 50 ? `${text.substring(0, 50)}...` : text
              }
            });
            await notification.save();
            
            // Send notification to user
            io.to(recipientSocketId).emit('notification:message', {
              _id: notification._id,
              type: 'private',
              sender: {
                _id: userId,
                username,
                profileImg: socket.user.profileImg
              },
              preview: text.length > 50 ? `${text.substring(0, 50)}...` : text,
              timestamp: new Date()
            });
          }
        }
      } catch (error) {
        console.error('Error sending private message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
    
    // ===== GROUP CHAT HANDLERS =====
    
    // Join a group chat room
    socket.on('group:join', async ({ groupId }) => {
      try {
        if (!groupId) return;
        
        // Find the group
        const group = await ChatGroup.findOne({
          _id: groupId,
          'members.user': userId,
          isActive: true
        });
        
        if (!group) {
          return socket.emit('error', { message: 'Group not found or you are not a member' });
        }
        
        const roomId = `group:${groupId}`;
        console.log(`👥 User ${username} joined group chat: ${roomId}`);
        
        // Leave all other group rooms first
        Array.from(socket.rooms)
          .filter(room => room !== socket.id && room.startsWith('group:'))
          .forEach(room => socket.leave(room));
        
        // Join the group room
        socket.join(roomId);
        
        // Update last read timestamp for current user
        const memberIndex = group.members.findIndex(
          member => member.user.toString() === userId
        );
        
        if (memberIndex !== -1) {
          group.members[memberIndex].lastRead = new Date();
          await group.save();
        }
        
        // Return the room ID to the client
        socket.emit('group:joined', { roomId, groupId });
        
        // Notify other group members
        socket.to(roomId).emit('group:userJoined', {
          user: {
            _id: userId,
            username,
            profileImg: socket.user.profileImg
          },
          groupId
        });
      } catch (error) {
        console.error('Error joining group chat:', error);
        socket.emit('error', { message: 'Failed to join group chat' });
      }
    });
    
    // Send a message to a group
    socket.on('group:message', async ({ roomId, groupId, text, attachments = [] }) => {
      try {
        if (!roomId || !text || !groupId) {
          return socket.emit('error', { message: 'Invalid message data' });
        }
        
        console.log(`💬 Group message from ${username} in ${roomId}: ${text.substring(0, 20)}...`);
        
        // Find the group
        const group = await ChatGroup.findOne({
          _id: groupId,
          'members.user': userId,
          isActive: true
        });
        
        if (!group) {
          return socket.emit('error', { message: 'Group not found or you are not a member' });
        }
        
        // Check if user has permission to send messages
        const userMember = group.members.find(member => member.user.toString() === userId);
        const canSendMessages = 
          userMember.role === 'admin' || 
          group.settings.sendMessages === 'all_members';
        
        if (!canSendMessages) {
          return socket.emit('error', { message: 'You do not have permission to send messages in this group' });
        }
        
        // Get member IDs for participants
        const memberIds = group.members.map(member => member.user);
        
        // Create message in database
        const message = new Message({
          sender: userId,
          group: groupId,
          text,
          chatType: 'group',
          participants: memberIds,
          attachments: attachments.map(att => {
            // Log the attachment URLs to debug
            if (att.url) {
              console.log(`SOCKET DEBUG: Original attachment URL: ${att.url}`);
            }
            
            // Don't modify the URL - keep the original URL
            return {
              type: att.type,
              url: att.url, // Keep the original URL without modification
              name: att.name,
              size: att.size
            };
          }),
          readBy: [{ user: userId, readAt: new Date() }]
        });
        
        await message.save();
        
        // Update last message in group
        group.lastMessage = {
          text,
          sender: userId,
          sentAt: new Date()
        };
        await group.save();
        
        // Populate sender info
        await message.populate('sender', '_id username profileImg');
        
        // Create formatted message for the client
        const formattedMessage = {
          _id: message._id,
          sender: {
            _id: message.sender._id,
            username: message.sender.username,
            profileImg: message.sender.profileImg
          },
          text: message.text,
          attachments: message.attachments,
          createdAt: message.createdAt,
          groupId
        };
        
        // Send to everyone in the group
        io.to(roomId).emit('group:message', formattedMessage);
        
        // Clear typing indicator
        handleTypingStop({ roomId, userId });
        
        // Send notifications to members not in the room
        for (const memberId of memberIds) {
          // Skip the sender
          if (memberId.toString() === userId) continue;
          
          const memberSocketId = activeUsers.get(memberId.toString());
          if (memberSocketId) {
            const memberSocket = io.sockets.sockets.get(memberSocketId);
            if (memberSocket && !memberSocket.rooms.has(roomId)) {
              // Create notification in database
              const notification = new ChatNotification({
                recipient: memberId,
                type: 'new_message',
                sender: userId,
                message: message._id,
                chat: {
                  id: groupId,
                  model: 'ChatGroup',
                  name: group.name
                },
                content: {
                  text: `${username} sent a message in ${group.name}`,
                  preview: text.length > 50 ? `${text.substring(0, 50)}...` : text
                }
              });
              await notification.save();
              
              // Send notification to user
              io.to(memberSocketId).emit('notification:message', {
                _id: notification._id,
                type: 'group',
                group: {
                  _id: groupId,
                  name: group.name,
                  avatar: group.avatar
                },
                sender: {
                  _id: userId,
                  username,
                  profileImg: socket.user.profileImg
                },
                preview: text.length > 50 ? `${text.substring(0, 50)}...` : text,
                timestamp: new Date()
              });
            }
          }
        }
      } catch (error) {
        console.error('Error sending group message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
    
    // ===== TYPING INDICATORS =====
    
    // Handle user typing
    socket.on('typing:start', ({ roomId }) => {
      handleTypingStart({ roomId, userId, username });
    });
    
    // Handle user stopped typing
    socket.on('typing:stop', ({ roomId }) => {
      handleTypingStop({ roomId, userId });
    });
    
    function handleTypingStart({ roomId, userId, username }) {
      if (!roomId) return;
      
      // Add user to typing users for this room
      if (!typingUsers.has(roomId)) {
        typingUsers.set(roomId, new Set());
      }
      
      const roomTypers = typingUsers.get(roomId);
      if (!roomTypers.has(userId)) {
        roomTypers.add(userId);
        
        // Update typing indicator in database
        updatePresenceTyping(userId, roomId);
        
        // Broadcast to the room that this user is typing
        socket.to(roomId).emit('typing:update', {
          roomId,
          users: Array.from(roomTypers).map(id => ({
            _id: id,
            username: id === userId ? username : getUsernameById(id)
          }))
        });
      }
    }
    
    function handleTypingStop({ roomId, userId }) {
      if (!roomId) return;
      
      // Remove user from typing users for this room
      if (typingUsers.has(roomId)) {
        const roomTypers = typingUsers.get(roomId);
        
        if (userId) {
          roomTypers.delete(userId);
          
          // Update typing indicator in database
          removePresenceTyping(userId, roomId);
        } else {
          // If no userId provided, this is called when sending a message
          // so we remove the sender from typing users
          roomTypers.delete(socket.user._id);
          
          // Update typing indicator in database
          removePresenceTyping(socket.user._id, roomId);
        }
        
        // If no more users are typing, clean up
        if (roomTypers.size === 0) {
          typingUsers.delete(roomId);
        }
        
        // Broadcast typing update
        socket.to(roomId).emit('typing:update', {
          roomId,
          users: Array.from(roomTypers).map(id => ({
            _id: id,
            username: getUsernameById(id)
          }))
        });
      }
    }
    
    // Helper to get username by ID (from active sockets)
    function getUsernameById(userId) {
      const socketId = activeUsers.get(userId);
      if (socketId) {
        const userSocket = io.sockets.sockets.get(socketId);
        if (userSocket && userSocket.user) {
          return userSocket.user.username;
        }
      }
      return 'User';
    }
    
    // Update user presence typing status
    async function updatePresenceTyping(userId, roomId) {
      try {
        // Determine if this is a private or group chat
        const chatType = roomId.startsWith('private:') ? 'PrivateChat' : 'ChatGroup';
        
        // Extract the actual chat ID from the room ID
        const chatId = roomId.split(':')[1];
        
        // Update presence in database
        const presence = await UserPresence.findOne({ user: userId });
        if (presence) {
          await presence.startTyping(chatId, chatType);
        }
      } catch (error) {
        console.error('Error updating typing status:', error);
      }
    }
    
    // Remove user presence typing status
    async function removePresenceTyping(userId, roomId) {
      try {
        // Determine if this is a private or group chat
        const chatType = roomId.startsWith('private:') ? 'PrivateChat' : 'ChatGroup';
        
        // Extract the actual chat ID from the room ID
        const chatId = roomId.split(':')[1];
        
        // Update presence in database
        const presence = await UserPresence.findOne({ user: userId });
        if (presence) {
          await presence.stopTyping(chatId, chatType);
        }
      } catch (error) {
        console.error('Error removing typing status:', error);
      }
    }
    
    // ===== USER STATUS UPDATES =====
    
    // Handle user status change
    socket.on('status:update', async ({ status }) => {
      if (!['online', 'away', 'busy', 'invisible'].includes(status)) {
        return socket.emit('error', { message: 'Invalid status' });
      }
      
      try {
        // Update presence in database
        const presence = await UserPresence.findOne({ user: userId });
        if (presence) {
          await presence.updateStatus(status, socket.id);
          
          // If user is invisible, don't broadcast status
          if (status !== 'invisible') {
            // Broadcast status update to all users
            socket.broadcast.emit('user:status', {
              userId,
              status,
              timestamp: new Date()
            });
          }
          
          socket.emit('status:updated', { status });
        }
      } catch (error) {
        console.error('Error updating user status:', error);
        socket.emit('error', { message: 'Failed to update status' });
      }
    });
    
    // ===== PRIVACY SETTINGS =====
    
    // Update privacy settings
    socket.on('privacy:update', async (settings) => {
      try {
        const presence = await UserPresence.findOne({ user: userId });
        if (presence) {
          await presence.updatePrivacySettings(settings);
          socket.emit('privacy:updated', presence.privacySettings);
        }
      } catch (error) {
        console.error('Error updating privacy settings:', error);
        socket.emit('error', { message: 'Failed to update privacy settings' });
      }
    });
    
    // ===== DISCONNECT HANDLER =====
    
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${username} (${userId})`);
      
      // Remove user from active users
      activeUsers.delete(userId);
      userSockets.delete(socket.id);
      
      // Update user presence in database
      try {
        const presence = await UserPresence.findOne({ user: userId });
        if (presence) {
          presence.status = 'offline';
          presence.lastActive = new Date();
          
          // Only clear socket ID if it matches the current one
          if (presence.socketId === socket.id) {
            presence.socketId = null;
          }
          
          await presence.save();
        }
      } catch (error) {
        console.error('Error updating presence on disconnect:', error);
      }
      
      // Remove user from all typing indicators
      typingUsers.forEach((users, roomId) => {
        if (users.has(userId)) {
          users.delete(userId);
          // Broadcast typing update
          socket.to(roomId).emit('typing:update', {
            roomId,
            users: Array.from(users).map(id => ({
              _id: id,
              username: getUsernameById(id)
            }))
          });
        }
      });
      
      // Broadcast user offline status
      socket.broadcast.emit('user:offline', { 
        userId,
        timestamp: new Date()
      });
    });
  });

  return io;
}

module.exports = setupSocketServer; 