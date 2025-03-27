const mongoose = require('mongoose')

const StorySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
    },
    filters: {
      type: String,
    },
    viewers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    replies: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      message: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    duration: {
      type: Number,
      default: 24, // Duration in hours before story expires
    },
    expiresAt: {
      type: Date,
      required: true,
      default: function() {
        const now = new Date();
        return new Date(now.getTime() + this.duration * 60 * 60 * 1000);
      }
    }
  },
  { 
    timestamps: true,
  }
);

// Index to automatically delete expired stories
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Add methods to check if story is expired
StorySchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Add method to add a viewer
StorySchema.methods.addViewer = async function(userId) {
  if (!this.viewers.includes(userId)) {
    this.viewers.push(userId);
    await this.save();
  }
  return this;
};

module.exports = mongoose.model('Story', StorySchema);
