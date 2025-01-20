const express = require('express');
const userRouter = express.Router();
const { requireAuth } = require('@clerk/clerk-sdk-node');
const checkObjectID = require('../middleware/main/checkObjectID');

userRouter.use(requireAuth); // Protect all user routes with Clerk
userRouter.use(checkObjectID);

userRouter.get('/:id', require('../controllers/user/getUserById')); // Get User by Id
userRouter.delete('/:id', require('../controllers/user/deleteUser')); // Delete User
userRouter.post('/:id/follow-unfollow', require('../controllers/user/followOrUnfollowUser')); // Follow or Unfollow a User
userRouter.get('/:id/followers', require('../controllers/user/getFollowerList')); // Get User's Followers List
userRouter.get('/:id/following', require('../controllers/user/getFollowingList')); // Get User's Following List
userRouter.patch('/:id', require('../controllers/user/updateUser')); // Update User's Profile

module.exports = userRouter;
