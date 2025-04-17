const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');

// Import controllers
const messageController = require('../controllers/chat/messageController');
const groupController = require('../controllers/chat/groupController');
const privateChatController = require('../controllers/chat/privateChatController');
const chatController = require('../controllers/chat/chatController');
const notificationController = require('../controllers/chat/notificationController');

// Import custom middleware
const { normalizeAttachmentUrls, validateMessageContent } = require('../middleware/chat/messageMiddleware');

// Middleware
router.use(requireAuth);

// Chat overview routes
router.get('/all', chatController.getAllChats);
router.get('/unread', chatController.getUnreadCount);
router.get('/search', chatController.searchChats);

// Messages routes
router.post('/messages', normalizeAttachmentUrls, validateMessageContent, (req, res) => {
  try {
    // Log request data to help with debugging
    console.log('📝 Message request received:');
    console.log('- Chat ID:', req.body.chatId);
    console.log('- Chat Type:', req.body.chatType);
    console.log('- Has text:', !!req.body.text);
    console.log('- Has attachments:', req.body.attachments ? req.body.attachments.length : 0);
    
    // Log attachment details if available
    if (req.body.attachments && req.body.attachments.length > 0) {
      console.log('📎 Attachments details:');
      req.body.attachments.forEach((att, index) => {
        console.log(`- Attachment ${index + 1}:`);
        console.log(`  Type: ${att.type}`);
        console.log(`  Name: ${att.name}`);
        console.log(`  Size: ${att.size} bytes`);
        console.log(`  URL: ${att.url}`);
      });
    }
    
    // Process the request with the controller
    messageController.sendMessage(req, res);
  } catch (error) {
    console.error('❌ Error in /messages route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing message request',
      error: error.message
    });
  }
});

// HTTP fallback endpoint for client-side socket failures
// This route directly handles HTTP requests when socket fails
router.post('/messages/http-fallback', normalizeAttachmentUrls, validateMessageContent, (req, res) => {
  try {
    console.log('📝 HTTP Fallback message request received');
    console.log('- Chat ID:', req.body.chatId);
    console.log('- Chat Type:', req.body.chatType);
    console.log('- Has text:', !!req.body.text);
    console.log('- Has attachments:', req.body.attachments ? req.body.attachments.length : 0);
    
    // Ensure text exists (empty string is valid)
    if (req.body.text === undefined) {
      req.body.text = '';
    }
    
    // Log attachment details if available
    if (req.body.attachments && req.body.attachments.length > 0) {
      console.log('📎 Attachments details in HTTP fallback:');
      req.body.attachments.forEach((att, index) => {
        console.log(`- Attachment ${index + 1}:`);
        console.log(`  Type: ${att.type}`);
        console.log(`  Name: ${att.name}`);
        console.log(`  Size: ${att.size} bytes`);
        console.log(`  URL: ${att.url}`);
      });
    }
    
    // Process the request with the controller
    messageController.sendMessage(req, res);
  } catch (error) {
    console.error('❌ Error in HTTP fallback route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing message request',
      error: error.message
    });
  }
});

router.get('/messages/:chatId', chatController.getChatMessages);
router.put('/messages/:messageId/read', messageController.markAsRead);
router.put('/messages/read', messageController.markAllAsRead);
router.delete('/messages/:messageId', messageController.deleteMessage);

// Private chat routes
router.post('/private', privateChatController.createOrGetPrivateChat);
router.get('/private/:chatId', privateChatController.getPrivateChatDetails);
router.get('/private', privateChatController.getUserPrivateChats);
router.put('/private/:chatId/block', privateChatController.toggleBlockUser);
router.delete('/private/:chatId', privateChatController.deletePrivateChat);

// Group chat routes
router.post('/group', groupController.createGroup);
router.delete('/group/:groupId', groupController.deleteGroup);
router.get('/group/:groupId', groupController.getGroupDetails);
router.get('/group', groupController.getUserGroups);
router.put('/group/:groupId', groupController.updateGroup);
router.post('/group/:groupId/leave', groupController.leaveGroup);
router.post('/group/:groupId/members', groupController.addMembers);
router.delete('/group/:groupId/members/:memberId', groupController.removeMember);
router.put('/group/:groupId/members/:memberId/role', groupController.changeMemberRole);

// Notification routes
router.get('/notifications', notificationController.getNotifications);
router.put('/notifications/:notificationId/read', notificationController.markAsRead);
router.put('/notifications/read', notificationController.markAllAsRead);
router.delete('/notifications/:notificationId', notificationController.deleteNotification);
router.delete('/notifications', notificationController.deleteAllNotifications);

module.exports = router; 