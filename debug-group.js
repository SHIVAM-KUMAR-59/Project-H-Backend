/**
 * Debug script for testing group creation
 * Run with: node debug-group.js
 */
const mongoose = require('mongoose');
const ChatGroup = require('./models/ChatGroup');
const User = require('./models/User');

// Connect to MongoDB
const connectToMongo = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/projectH', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test group creation
const testGroupCreation = async () => {
  try {
    // First, find some users to add to the group
    const users = await User.find().limit(3);
    if (users.length < 3) {
      console.error('❌ Not enough users found in the database. Need at least 3.');
      return;
    }

    console.log(`👤 Found ${users.length} users to add to test group:`);
    users.forEach(user => {
      console.log(`- ${user.username} (${user._id})`);
    });

    // Create a test group - use first user as creator
    const creator = users[0];
    const members = [
      {
        user: creator._id,
        role: 'admin',
        joinedAt: new Date(),
        lastRead: new Date()
      },
      {
        user: users[1]._id,
        role: 'member',
        joinedAt: new Date(),
        lastRead: new Date()
      },
      {
        user: users[2]._id,
        role: 'member',
        joinedAt: new Date(),
        lastRead: new Date()
      }
    ];

    console.log('👥 Creating test group with members:', members.map(m => ({
      user: m.user.toString(),
      role: m.role
    })));

    // Create the group
    const group = new ChatGroup({
      name: 'Test Group',
      description: 'A test group for debugging',
      members: members,
      creator: creator._id,
      settings: ChatGroup.getDefaultSettings()
    });

    console.log(`⏳ Group before save: ${group.members.length} members`);
    
    // Save the group
    await group.save();
    
    console.log(`✅ Group after save: ${group.members.length} members`);
    
    // Fetch the group from database to verify
    const savedGroup = await ChatGroup.findById(group._id);
    console.log(`🔍 Group from database: ${savedGroup.members.length} members`);
    console.log('Members:', savedGroup.members.map(m => ({
      user: m.user.toString(),
      role: m.role
    })));
    
    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Error testing group creation:', error);
  }
};

// Run the test
(async () => {
  await connectToMongo();
  await testGroupCreation();
  mongoose.disconnect();
})(); 