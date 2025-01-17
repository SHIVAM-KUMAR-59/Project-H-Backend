const express = require('express')
const postRouter = express.Router()
const verifyToken = require('../middleware/auth/verifyToken.js')
const checkObjectID = require('../middleware/main/checkObjectID')
const upload = require('../utils/main/imageUploading')

// Unprotected routes
postRouter.get('/all', require('../controllers/post/getAllPost.js')) // Get all posts
postRouter.get(
  '/:id',
  checkObjectID,
  require('../controllers/post/getPostById.js'),
) // Get a specific post

postRouter.post(
  '/create/:id',
  upload.single('image'),
  require('../controllers/post/createPost.js'),
) // Create a new post
// Protected routes
postRouter.use(verifyToken)

// Checking ID in query paramaters
postRouter.use(checkObjectID)
postRouter.patch('/update/:id', require('../controllers/post/updatePost.js')) // Update a post
postRouter.delete('/delete/:id', require('../controllers/post/deletePost.js')) // Delete a post
postRouter.post('/like/:id', require('../controllers/post/likeOrUnlikePost.js')) // Like or unlike a post
postRouter.post('/save/:id', require('../controllers/post/savePost.js')) // Save a post
postRouter.get('/comments/:id', require('../controllers/post/getAllComment.js')) // Get all comments for a post
postRouter.post('/comment/:id', require('../controllers/post/addComment.js')) // Add a comment to a post

module.exports = postRouter
