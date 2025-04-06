const mongoose = require('mongoose');

const ChatNotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'new_message',
        'group_invitation',
        'mention',
        'added_to_group',
        'removed_from_group',
        'admin_promotion',
        'admin_demotion',
        'group_updated',
        'group_members_added',
        'group_removed',
        'group_member_left',
        'group_role_changed'
      ],
      required: true,
    },
    // Sender of the notification (if applicable)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Message reference (if notification is about a message)
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    // Chat reference (if notification is about a chat)
    chat: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'chat.model',
      },
      model: {
        type: String,
        enum: ['PrivateChat', 'ChatGroup'],
      },
      name: String, // For group chats
    },
    // Notification content
    content: {
      text: String,
      preview: String,
    },
    // Notification metadata
    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
    // Read status
    read: {
      type: Boolean,
      default: false,
    },
    // When notification was read
    readAt: {
      type: Date,
    },
    // Delivered status (for push notifications)
    delivered: {
      type: Boolean,
      default: false,
    },
    // When notification was delivered
    deliveredAt: {
      type: Date,
    },
    // Whether notification was actioned upon
    actioned: {
      type: Boolean,
      default: false,
    },
    // Whether notification has been deleted
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Create a TTL index to automatically delete old notifications after 30 days
ChatNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Indexes for efficient queries
ChatNotificationSchema.index({ recipient: 1, read: 1 });
ChatNotificationSchema.index({ recipient: 1, type: 1 });
ChatNotificationSchema.index({ recipient: 1, 'chat.id': 1 });
ChatNotificationSchema.index({ message: 1 });

// Method to mark notification as read
ChatNotificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Method to mark notification as delivered
ChatNotificationSchema.methods.markAsDelivered = async function() {
  this.delivered = true;
  this.deliveredAt = new Date();
  return this.save();
};

// Method to mark notification as actioned
ChatNotificationSchema.methods.markAsActioned = async function() {
  this.actioned = true;
  return this.save();
};

// Method to soft delete a notification
ChatNotificationSchema.methods.softDelete = async function() {
  this.deleted = true;
  return this.save();
};

// Static method to mark all as read for a user
ChatNotificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { recipient: userId, read: false },
    { read: true, readAt: new Date() }
  );
};

// Static method to mark all as read for a specific chat
ChatNotificationSchema.statics.markAllAsReadForChat = async function(userId, chatId, chatModel) {
  return this.updateMany(
    { 
      recipient: userId, 
      read: false,
      'chat.id': chatId,
      'chat.model': chatModel
    },
    { read: true, readAt: new Date() }
  );
};

// Static method to get unread count for a user
ChatNotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, read: false, deleted: false });
};

module.exports = mongoose.model('ChatNotification', ChatNotificationSchema); 