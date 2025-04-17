const mongoose = require('mongoose');

const ChatGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    avatar: {
      type: String, // URL to the group avatar image
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member',
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
      // Last time the user read messages in this group
      lastRead: {
        type: Date,
        default: Date.now,
      },
    }],
    settings: {
      // Who can send messages
      sendMessages: {
        type: String,
        enum: ['all_members', 'admins_only'],
        default: 'all_members',
      },
      // Who can add members
      addMembers: {
        type: String,
        enum: ['all_members', 'admins_only'],
        default: 'admins_only',
      },
      // Who can remove members
      removeMembers: {
        type: String,
        enum: ['all_members', 'admins_only'],
        default: 'admins_only',
      },
      // Whether the group is discoverable in search
      isDiscoverable: {
        type: Boolean,
        default: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Last message in the group for preview
    lastMessage: {
      text: String,
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      sentAt: Date,
    },
  },
  { timestamps: true }
);

// Add creator as the first admin member automatically
ChatGroupSchema.pre('save', function(next) {
  // Only check for creator membership when the group is first created
  if (this.isNew) {
    console.log('📝 Pre-save hook for new group: Adding creator as admin if needed');
    console.log(`- Current members count: ${this.members.length}`);
    console.log(`- Creator ID: ${this.creator}`);
    console.log(`- Members before hook: ${JSON.stringify(this.members.map(m => ({
      user: m.user.toString(),
      role: m.role
    })))}`);
    
    // Check if the creator is already in the members array
    const creatorExists = this.members.some(
      member => member.user && member.user.toString() === this.creator.toString()
    );
    
    console.log(`- Creator already exists in members: ${creatorExists}`);
    
    if (!creatorExists) {
      // Add the creator as admin if not already present
      console.log('- Adding creator as admin member');
      // Add to the beginning of the array without removing existing members
      this.members.unshift({
        user: this.creator,
        role: 'admin',
        joinedAt: new Date(),
        lastRead: new Date(),
      });
    } else {
      // Ensure creator has admin role but don't modify other members
      console.log('- Ensuring creator has admin role');
      const creatorIndex = this.members.findIndex(
        member => member.user && member.user.toString() === this.creator.toString()
      );
      if (creatorIndex !== -1) {
        this.members[creatorIndex].role = 'admin';
      }
    }
    
    console.log(`- Final members count: ${this.members.length}`);
    console.log(`- Members after hook: ${JSON.stringify(this.members.map(m => ({
      user: m.user.toString(),
      role: m.role
    })))}`);
  }
  next();
});

// Helper method to check if a user is a member of the group
ChatGroupSchema.methods.isMember = function(userId) {
  return this.members.some(member => member.user.toString() === userId.toString());
};

// Helper method to check if a user is an admin of the group
ChatGroupSchema.methods.isAdmin = function(userId) {
  return this.members.some(
    member => member.user.toString() === userId.toString() && member.role === 'admin'
  );
};

// Helper method to add a member to the group
ChatGroupSchema.methods.addMember = async function(userId, role = 'member') {
  // Check if the user is already a member
  if (this.isMember(userId)) {
    return;
  }

  this.members.push({
    user: userId,
    role,
    joinedAt: new Date(),
    lastRead: new Date(),
  });

  return this.save();
};

// Helper method to remove a member from the group
ChatGroupSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(member => member.user.toString() !== userId.toString());
  return this.save();
};

// Helper method to update a member's role
ChatGroupSchema.methods.updateMemberRole = async function(userId, newRole) {
  const memberIndex = this.members.findIndex(
    member => member.user.toString() === userId.toString()
  );
  
  if (memberIndex !== -1) {
    this.members[memberIndex].role = newRole;
    return this.save();
  }
};

// Define static method for default settings
ChatGroupSchema.statics.getDefaultSettings = function() {
  return {
    sendMessages: 'all_members',
    addMembers: 'admins_only',
    removeMembers: 'admins_only',
    isDiscoverable: true
  };
};

// Indexes for efficient queries
ChatGroupSchema.index({ creator: 1 });
ChatGroupSchema.index({ 'members.user': 1 });
ChatGroupSchema.index({ 'settings.isDiscoverable': 1 });
ChatGroupSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('ChatGroup', ChatGroupSchema); 