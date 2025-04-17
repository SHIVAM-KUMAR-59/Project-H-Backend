const User = require('../../models/User');
const ChatGroup = require('../../models/ChatGroup');
const ChatNotification = require('../../models/ChatNotification');
const mongoose = require('mongoose');

/**
 * Create a new group chat
 */
const createGroup = async (req, res) => {
  try {
    console.log('👥 Creating new group chat');
    const { name, description = '', members = [], settings = {} } = req.body;
    
    console.log('📊 Request data:', { 
      name, 
      description, 
      memberCount: members.length,
      memberIds: members, // Log all member IDs for debugging
      hasSettings: Object.keys(settings).length > 0
    });
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
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
    console.log('👤 Creating group as user:', { id: mongoUserId.toString(), username: user.username });
    
    // Prepare an array to store all member data
    let groupMembers = [];
    
    // First add the creator (current user) as an admin
    groupMembers.push({
      user: mongoUserId,
      role: 'admin',
      joinedAt: new Date(),
      lastRead: new Date()
    });
    
    // Process other members if any
    if (members && members.length > 0) {
      console.log(`🔍 Processing ${members.length} member IDs`);
      
      // Find all users in one query
      const memberUsers = await User.find({ 
        _id: { $in: members }
      }, '_id username profileImg');
      
      console.log(`✅ Found ${memberUsers.length} valid members`);
      
      // Add each member except the creator (who's already added above)
      for (const memberUser of memberUsers) {
        // Skip if this is the creator (already added above)
        if (memberUser._id.toString() === mongoUserId.toString()) {
          console.log(`👤 Skipping creator in members list: ${memberUser.username}`);
          continue;
        }
        
        console.log(`👤 Adding member: ${memberUser.username} (${memberUser._id})`);
        groupMembers.push({
          user: memberUser._id,
          role: 'member',
          joinedAt: new Date(),
          lastRead: new Date()
        });
      }
    }
    
    console.log(`👥 Final members list: ${groupMembers.length} users`);
    for (const member of groupMembers) {
      console.log(`- Member: ${member.user.toString()}, Role: ${member.role}`);
    }
    
    // Create the group with explicit members list
    const group = new ChatGroup({
      name,
      description,
      members: groupMembers,
      creator: mongoUserId,
      settings: {
        ...ChatGroup.getDefaultSettings(),
        ...settings
      }
    });
    
    // Save the group
    await group.save();
    
    console.log(`💾 Group saved with ${group.members.length} members`);
    
    // Populate the members info for the response
    await group.populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    // Verify members after population
    console.log(`📊 Populated group has ${group.members.length} members:`);
    for (const member of group.members) {
      console.log(`- ${member.user.username} (${member.user._id}), Role: ${member.role}`);
    }
    
    // Create notifications for members excluding the creator
    for (const member of group.members) {
      // Skip creating notification for the creator
      if (member.user._id.toString() === mongoUserId.toString()) {
        console.log(`📢 Skipping notification for creator: ${member.user.username}`);
        continue;
      }
      
      console.log(`📢 Creating notification for: ${member.user.username}`);
      try {
        const notification = new ChatNotification({
          recipient: member.user._id,
          type: 'added_to_group',
          sender: mongoUserId,
          chat: {
            id: group._id,
            model: 'ChatGroup',
            name: group.name
          },
          content: {
            text: `${user.username} added you to ${group.name}`,
            preview: description || `New group: ${name}`
          }
        });
        await notification.save();
      } catch (notifError) {
        console.error(`❌ Error creating notification for ${member.user.username}:`, notifError);
        // Continue even if notification fails
      }
    }
    
    console.log('✅ Group created with ID:', group._id);
    return res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: {
        _id: group._id,
        name: group.name,
        description: group.description,
        members: group.members.map(member => ({
          _id: member.user._id,
          username: member.user.username,
          profileImg: member.user.profileImg,
          role: member.role
        })),
        settings: group.settings,
        createdAt: group.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error creating group:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating group',
      error: error.message
    });
  }
};

/**
 * Get group details
 */
const getGroupDetails = async (req, res) => {
  try {
    console.log('👥 Getting group details');
    const { groupId } = req.params;
    
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
    
    // Find the group
    const group = await ChatGroup.findOne({
      _id: groupId,
      'members.user': mongoUserId,
      isActive: true
    }).populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }
    
    console.log('✅ Group details retrieved');
    return res.status(200).json({
      success: true,
      data: {
        _id: group._id,
        name: group.name,
        description: group.description,
        members: group.members.map(member => ({
          _id: member.user._id,
          username: member.user.username,
          profileImg: member.user.profileImg,
          role: member.role,
          joinedAt: member.joinedAt
        })),
        settings: group.settings,
        createdAt: group.createdAt,
        createdBy: group.createdBy,
        lastMessage: group.lastMessage
      }
    });
  } catch (error) {
    console.error('❌ Error getting group details:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting group details',
      error: error.message
    });
  }
};

/**
 * Update group settings
 */
const updateGroup = async (req, res) => {
  try {
    console.log('👥 Updating group');
    const { groupId } = req.params;
    const updates = req.body;
    
    // Validate required fields
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
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
    
    // Find the group
    const group = await ChatGroup.findOne({
      _id: groupId,
      'members.user': mongoUserId,
      isActive: true
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }
    
    // Check if user is admin (only admins can update settings)
    const userMember = group.members.find(member => member.user.toString() === mongoUserId.toString());
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can update group settings'
      });
    }
    
    // Apply updates (only allow certain fields)
    const allowedUpdates = ['name', 'description', 'settings'];
    
    for (const key of Object.keys(updates)) {
      if (allowedUpdates.includes(key)) {
        if (key === 'settings') {
          // For settings, merge with existing settings to avoid overwriting unmentioned ones
          group.settings = {
            ...group.settings,
            ...updates.settings
          };
        } else {
          group[key] = updates[key];
        }
      }
    }
    
    await group.save();
    
    // Create notifications for members about the update
    if (updates.name) {
      for (const member of group.members) {
        if (member.user.toString() === mongoUserId.toString()) continue;
        
        const notification = new ChatNotification({
          recipient: member.user,
          type: 'group_updated',
          sender: mongoUserId,
          chat: {
            id: group._id,
            model: 'ChatGroup',
            name: group.name
          },
          content: {
            text: `${user.username} updated the group name to "${group.name}"`,
            preview: group.description || `Group updated: ${group.name}`
          }
        });
        await notification.save();
      }
    }
    
    console.log('✅ Group updated');
    return res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: {
        _id: group._id,
        name: group.name,
        description: group.description,
        settings: group.settings
      }
    });
  } catch (error) {
    console.error('❌ Error updating group:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating group',
      error: error.message
    });
  }
};

/**
 * Add members to group
 */
const addMembers = async (req, res) => {
  try {
    console.log('👥 Adding members to group');
    const { groupId } = req.params;
    const { members } = req.body;
    
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Members array is required and cannot be empty'
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
    
    // Find the group
    const group = await ChatGroup.findOne({
      _id: groupId,
      'members.user': mongoUserId,
      isActive: true
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }
    
    // Check if user can add members (only admins or members if allowed)
    const userMember = group.members.find(member => member.user.toString() === mongoUserId.toString());
    const canAddMembers = 
      userMember.role === 'admin' || 
      group.settings.addMembers === 'all_members';
    
    if (!canAddMembers) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add members to this group'
      });
    }
    
    // Get existing member IDs
    const existingMemberIds = group.members.map(member => member.user.toString());
    
    // Filter out IDs already in the group
    const newMemberIds = members.filter(id => !existingMemberIds.includes(id.toString()));
    
    if (newMemberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All provided members are already in the group'
      });
    }
    
    // Find users for new members
    const newMembers = await User.find({
      _id: { $in: newMemberIds }
      // Removed isActive: true filter to allow inactive users
    }, '_id username profileImg');
    
    // Log which members weren't found but don't return an error
    if (newMembers.length !== newMemberIds.length) {
      const foundIds = newMembers.map(user => user._id.toString());
      const missingIds = newMemberIds.filter(id => !foundIds.includes(id.toString()));
      console.log(`⚠️ Warning: Only ${newMembers.length} out of ${newMemberIds.length} members were found in the database.`);
      console.log(`⚠️ Skipping missing member IDs: ${missingIds.join(', ')}`);
      // Continue with the members we found instead of returning an error
    }
    
    // Add new members to group
    for (const newMember of newMembers) {
      group.members.push({
        user: newMember._id,
        role: 'member',
        joinedAt: new Date(),
        lastRead: new Date()
      });
    }
    
    await group.save();
    
    // Create notifications for new members
    for (const newMember of newMembers) {
      const notification = new ChatNotification({
        recipient: newMember._id,
        type: 'added_to_group',
        sender: mongoUserId,
        chat: {
          id: group._id,
          model: 'ChatGroup',
          name: group.name
        },
        content: {
          text: `${user.username} added you to ${group.name}`,
          preview: group.description || `Group: ${group.name}`
        }
      });
      await notification.save();
    }
    
    // Also notify existing members
    for (const member of group.members) {
      // Skip the user who added the members and the new members
      if (member.user.toString() === mongoUserId.toString() || 
          newMemberIds.includes(member.user.toString())) {
        continue;
      }
      
      const notification = new ChatNotification({
        recipient: member.user,
        type: 'group_members_added',
        sender: mongoUserId,
        chat: {
          id: group._id,
          model: 'ChatGroup',
          name: group.name
        },
        content: {
          text: `${user.username} added ${newMembers.length} new members to ${group.name}`,
          preview: `New members: ${newMembers.map(m => m.username).join(', ').substring(0, 50)}`
        }
      });
      await notification.save();
    }
    
    console.log('✅ Added members to group');
    return res.status(200).json({
      success: true,
      message: `Added ${newMembers.length} members to the group`,
      data: {
        addedMembers: newMembers.map(member => ({
          _id: member._id,
          username: member.username,
          profileImg: member.profileImg
        }))
      }
    });
  } catch (error) {
    console.error('❌ Error adding members to group:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding members to group',
      error: error.message
    });
  }
};

/**
 * Remove a member from the group
 */
const removeMember = async (req, res) => {
  try {
    console.log('👥 Removing member from group');
    const { groupId, memberId } = req.params;
    
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
    
    // Find the group
    const group = await ChatGroup.findOne({
      _id: groupId,
      'members.user': mongoUserId,
      isActive: true
    }).populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }
    
    // Self-removal is always allowed
    const isSelfRemoval = memberId === mongoUserId.toString();
    
    if (!isSelfRemoval) {
      // Check if user can remove members (only admins)
      const userMember = group.members.find(member => member.user._id.toString() === mongoUserId.toString());
      if (!userMember || userMember.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only group admins can remove other members'
        });
      }
      
      // Cannot remove another admin
      const memberToRemove = group.members.find(member => member.user._id.toString() === memberId);
      if (memberToRemove && memberToRemove.role === 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Cannot remove an admin from the group'
        });
      }
    }
    
    // Check if member exists in the group
    const memberIndex = group.members.findIndex(member => member.user._id.toString() === memberId);
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this group'
      });
    }
    
    // Save member info before removal for notifications
    const removedMember = group.members[memberIndex];
    
    // Remove the member
    group.members.splice(memberIndex, 1);
    
    // If removing the last admin, promote someone else to admin
    if (!isSelfRemoval) {
      const hasAdminLeft = !group.members.some(member => member.role === 'admin');
      if (hasAdminLeft && group.members.length > 0) {
        // Promote the oldest member by joined date
        const oldestMember = [...group.members].sort((a, b) => a.joinedAt - b.joinedAt)[0];
        oldestMember.role = 'admin';
      }
    }
    
    // If no members left, mark group as inactive
    if (group.members.length === 0) {
      group.isActive = false;
    }
    
    await group.save();
    
    // Create notifications about removal
    if (!isSelfRemoval) {
      // Notify the removed user
      const notification = new ChatNotification({
        recipient: removedMember.user._id,
        type: 'group_removed',
        sender: mongoUserId,
        chat: {
          id: group._id,
          model: 'ChatGroup',
          name: group.name
        },
        content: {
          text: `${user.username} removed you from ${group.name}`,
          preview: `You were removed from the group: ${group.name}`
        }
      });
      await notification.save();
    }
    
    // Notify other members
    for (const member of group.members) {
      const notification = new ChatNotification({
        recipient: member.user._id,
        type: 'group_member_left',
        sender: mongoUserId,
        chat: {
          id: group._id,
          model: 'ChatGroup',
          name: group.name
        },
        content: {
          text: isSelfRemoval 
            ? `${removedMember.user.username} left ${group.name}`
            : `${user.username} removed ${removedMember.user.username} from ${group.name}`,
          preview: `Member ${isSelfRemoval ? 'left' : 'removed'}: ${removedMember.user.username}`
        }
      });
      await notification.save();
    }
    
    console.log('✅ Member removed from group');
    return res.status(200).json({
      success: true,
      message: isSelfRemoval
        ? 'You have left the group'
        : `Member ${removedMember.user.username} removed from the group`,
      data: {
        removedMember: {
          _id: removedMember.user._id,
          username: removedMember.user.username
        },
        remainingMembers: group.members.length
      }
    });
  } catch (error) {
    console.error('❌ Error removing member from group:', error);
    return res.status(500).json({
      success: false,
      message: 'Error removing member from group',
      error: error.message
    });
  }
};

/**
 * Change member role in the group
 */
const changeMemberRole = async (req, res) => {
  try {
    console.log('👥 Changing member role');
    const { groupId, memberId } = req.params;
    const { role } = req.body;
    
    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid role is required (admin or member)'
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
    
    // Find the group
    const group = await ChatGroup.findOne({
      _id: groupId,
      'members.user': mongoUserId,
      isActive: true
    }).populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }
    
    // Check if user is admin (only admins can change roles)
    const userMember = group.members.find(member => member.user._id.toString() === mongoUserId.toString());
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can change member roles'
      });
    }
    
    // Cannot change own role (to prevent last admin from demoting themselves)
    if (memberId === mongoUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own role'
      });
    }
    
    // Find the target member
    const memberIndex = group.members.findIndex(member => member.user._id.toString() === memberId);
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this group'
      });
    }
    
    // If demoting from admin, ensure there's at least one other admin
    const targetMember = group.members[memberIndex];
    if (targetMember.role === 'admin' && role === 'member') {
      const adminCount = group.members.filter(member => member.role === 'admin').length;
      if (adminCount <= 1) {
        return res.status(403).json({
          success: false,
          message: 'Cannot demote the last admin. Promote another member to admin first'
        });
      }
    }
    
    // Update the role
    const oldRole = targetMember.role;
    targetMember.role = role;
    await group.save();
    
    // Create notification for the member whose role changed
    const notification = new ChatNotification({
      recipient: targetMember.user._id,
      type: 'group_role_changed',
      sender: mongoUserId,
      chat: {
        id: group._id,
        model: 'ChatGroup',
        name: group.name
      },
      content: {
        text: `${user.username} changed your role in ${group.name} to ${role}`,
        preview: `Your role is now: ${role}`
      }
    });
    await notification.save();
    
    console.log('✅ Member role changed');
    return res.status(200).json({
      success: true,
      message: `Changed ${targetMember.user.username}'s role from ${oldRole} to ${role}`,
      data: {
        member: {
          _id: targetMember.user._id,
          username: targetMember.user.username,
          profileImg: targetMember.user.profileImg,
          newRole: role,
          oldRole
        }
      }
    });
  } catch (error) {
    console.error('❌ Error changing member role:', error);
    return res.status(500).json({
      success: false,
      message: 'Error changing member role',
      error: error.message
    });
  }
};

/**
 * Get user's groups
 */
const getUserGroups = async (req, res) => {
  try {
    console.log('👥 Getting user groups');
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
    
    // Find all active groups where user is a member
    const groups = await ChatGroup.find({
      'members.user': mongoUserId,
      isActive: true
    })
    .sort({ 'lastMessage.sentAt': -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    // Count total groups for pagination
    const totalGroups = await ChatGroup.countDocuments({
      'members.user': mongoUserId,
      isActive: true
    });
    
    console.log(`✅ Found ${groups.length} groups`);
    return res.status(200).json({
      success: true,
      data: {
        groups: groups.map(group => ({
          _id: group._id,
          name: group.name,
          description: group.description,
          members: group.members.map(member => ({
            _id: member.user._id,
            username: member.user.username,
            profileImg: member.user.profileImg,
            role: member.role
          })),
          lastMessage: group.lastMessage,
          createdAt: group.createdAt
        })),
        pagination: {
          total: totalGroups,
          page,
          limit,
          pages: Math.ceil(totalGroups / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting user groups:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting user groups',
      error: error.message
    });
  }
};

/**
 * Delete a group chat
 */
const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    console.log(`👥 Deleting group chat with ID: ${groupId}`);
    
    // Check if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log(`❌ Invalid group ID format: ${groupId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
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
    console.log(`🔍 Looking for group ${groupId} for user ${user.username} (${mongoUserId})`);
    
    // First, check if the group exists at all
    const groupExists = await ChatGroup.findById(groupId);
    if (!groupExists) {
      console.log(`❌ Group ${groupId} does not exist in the database`);
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Find the group without filtering by isActive to debug
    const group = groupExists; // reuse the group we already found
    console.log(`📊 Found group: ${group.name}, isActive: ${group.isActive}, memberCount: ${group.members.length}`);
    
    // Check if user is a member
    const isMember = group.members.some(member => 
      member.user && member.user.toString() === mongoUserId.toString()
    );
    
    if (!isMember) {
      console.log(`❌ User ${mongoUserId} is not a member of group ${groupId}`);
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }
    
    // Check if user is an admin or the creator
    const isAdmin = group.members.some(
      member => member.user && member.user.toString() === mongoUserId.toString() && member.role === 'admin'
    );
    const isCreator = group.creator && group.creator.toString() === mongoUserId.toString();
    
    console.log(`👤 User permissions: isAdmin=${isAdmin}, isCreator=${isCreator}, isVirtual=${!!group.isVirtual}`);
    
    // Only allow admins and creator to delete the group, unless it's a virtual group
    if (!isAdmin && !isCreator && !group.isVirtual) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can delete the group'
      });
    }
    
    // Soft delete the group (mark as inactive)
    group.isActive = false;
    await group.save();
    console.log(`✅ Group ${groupId} marked as inactive`);
    
    // Create notifications for members
    for (const member of group.members) {
      // Skip the user who deleted the group or members without a valid user reference
      if (!member.user || member.user.toString() === mongoUserId.toString()) {
        continue;
      }
      
      try {
        const notification = new ChatNotification({
          recipient: member.user,
          type: 'group_removed',
          sender: mongoUserId,
          content: {
            text: `${user.username} deleted the group "${group.name}"`,
            preview: 'Group deleted'
          }
        });
        await notification.save();
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Continue even if notification fails
      }
    }
    
    console.log('✅ Group deleted successfully');
    return res.status(200).json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting group:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting group',
      error: error.message
    });
  }
};

/**
 * Leave a group chat (self-removal)
 */
const leaveGroup = async (req, res) => {
  try {
    console.log('👥 User leaving group chat');
    const { groupId } = req.params;
    
    // Check if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log(`❌ Invalid group ID format: ${groupId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
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
    console.log(`👤 User ${user.username} (${mongoUserId}) is leaving group ${groupId}`);
    
    // Find the group
    const group = await ChatGroup.findOne({
      _id: groupId,
      'members.user': mongoUserId,
      isActive: true
    }).populate({
      path: 'members.user',
      select: '_id username profileImg'
    });
    
    if (!group) {
      console.log(`❌ Group ${groupId} not found or user is not a member`);
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }
    
    // Check if the user is the only admin
    const isUserAdmin = group.members.some(
      member => member.user._id.toString() === mongoUserId.toString() && member.role === 'admin'
    );
    
    const adminCount = group.members.filter(member => member.role === 'admin').length;
    
    // If this is the only admin and there are other members, promote someone else first
    if (isUserAdmin && adminCount === 1 && group.members.length > 1) {
      // Find the oldest member that isn't the current user
      const membersToPromote = group.members
        .filter(member => member.user._id.toString() !== mongoUserId.toString())
        .sort((a, b) => a.joinedAt - b.joinedAt);
      
      if (membersToPromote.length > 0) {
        const newAdmin = membersToPromote[0];
        console.log(`👑 Promoting ${newAdmin.user.username} to admin before leaving`);
        newAdmin.role = 'admin';
        
        // Create notification for the new admin
        const notification = new ChatNotification({
          recipient: newAdmin.user._id,
          type: 'admin_promotion',
          sender: mongoUserId,
          chat: {
            id: group._id,
            model: 'ChatGroup',
            name: group.name
          },
          content: {
            text: `You are now an admin of ${group.name} as ${user.username} left the group`,
            preview: 'You are now a group admin'
          }
        });
        await notification.save();
      }
    }
    
    // Find and remove the member
    const memberIndex = group.members.findIndex(member => member.user._id.toString() === mongoUserId.toString());
    if (memberIndex === -1) {
      console.log(`❌ User ${mongoUserId} not found in group members`);
      return res.status(404).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }
    
    // Save the removed member info for notifications
    const removedMember = group.members[memberIndex];
    
    // Remove the member
    group.members.splice(memberIndex, 1);
    
    // If no members left, mark group as inactive
    if (group.members.length === 0) {
      console.log(`🚫 No members left, marking group ${groupId} as inactive`);
      group.isActive = false;
    }
    
    await group.save();
    console.log(`✅ User ${user.username} successfully left group ${groupId}`);
    
    // Notify other members
    for (const member of group.members) {
      const notification = new ChatNotification({
        recipient: member.user._id,
        type: 'group_member_left',
        sender: mongoUserId,
        chat: {
          id: group._id,
          model: 'ChatGroup',
          name: group.name
        },
        content: {
          text: `${user.username} left the group ${group.name}`,
          preview: `${user.username} left the group`
        }
      });
      await notification.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'You have successfully left the group'
    });
  } catch (error) {
    console.error('❌ Error leaving group:', error);
    return res.status(500).json({
      success: false,
      message: 'Error leaving group',
      error: error.message
    });
  }
};

module.exports = {
  createGroup,
  getGroupDetails,
  updateGroup,
  addMembers,
  removeMember,
  changeMemberRole,
  getUserGroups,
  deleteGroup,
  leaveGroup
}; 