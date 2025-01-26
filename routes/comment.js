const express = require('express')
const commentRouter = express.Router()
const { verifyClerkToken } = require('../middleware/clerk/verifyToken')
const checkObjectID = require('../middleware/main/checkObjectID')

commentRouter.use(verifyClerkToken)
// commentRouter.use(checkObjectID)
commentRouter.get('/:id', require('../controllers/comment/getCommentById'))
commentRouter.patch('/:id', require('../controllers/comment/updateComment'))
commentRouter.delete('/:id', require('../controllers/comment/deleteComment'))
commentRouter.post(
  '/reply/:id',
  require('../controllers/comment/replyToComment'),
)
commentRouter.get(
  '/:id/replies',
  require('../controllers/comment/getAllReplies'),
)

module.exports = commentRouter
