const express = require('express');
const postRouter = express.Router();
const { requireAuth } = require('@clerk/clerk-sdk-node');
const checkObjectID = require('../middleware/main/checkObjectID');
const upload = require('../utils/main/imageUploading');

// Unprotected routes
postRouter.get('/all', require('../controllers/post/getAllPost')); // Get all posts
postRouter.get('/:id', checkObjectID, require('../controllers/post/getPostById')); // Get a specific post

postRouter.use(requireAuth); // Protect all subsequent routes

postRouter.post(
  '/create',
  upload.single('image'),
  require('../controllers/post/createPost'),
); // Create a new post

// Checking ID in query parameters
postRouter.patch('/update/:id', checkObjectID, require('../controllers/post/updatePost')); // Update a post
postRouter.delete('/delete/:id', checkObjectID, require('../controllers/post/deletePost')); // Delete a post
postRouter.post('/like/:id', checkObjectID, require('../controllers/post/likeOrUnlikePost')); // Like or unlike a post
postRouter.post('/save/:id', checkObjectID, require('../controllers/post/savePost')); // Save a post
postRouter.get('/comments/:id', checkObjectID, require('../controllers/post/getAllComment')); // Get all comments for a post
postRouter.post('/comment/:id', checkObjectID, require('../controllers/post/addComment')); // Add a comment to a post

module.exports = postRouter;
