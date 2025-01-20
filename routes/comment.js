const express = require('express');
const commentRouter = express.Router();
const { requireAuth } = require('@clerk/clerk-sdk-node');
const checkObjectID = require('../middleware/main/checkObjectID');

commentRouter.use(requireAuth); // Protect all comment routes with Clerk
commentRouter.use(checkObjectID);

commentRouter.get('/:id', require('../controllers/comment/getCommentById'));
commentRouter.patch('/:id', require('../controllers/comment/updateComment'));
commentRouter.delete('/:id', require('../controllers/comment/deleteComment'));
commentRouter.post('/:id/reply', require('../controllers/comment/replyToComment'));
commentRouter.get('/:id/replies', require('../controllers/comment/getAllReplies'));

module.exports = commentRouter;
