const Comment = require('../../models/Comment')
const User = require('../../models/User')

// Reply to a comment
const replyToComment = async (req, res) => {
  const { id } = req.params
  const { content } = req.body
  if (!content) {
    return res.status(400).json({ message: 'Please enter a comment' })
  }
  const comment = await Comment.findById(id)
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' })
  }
  const user = await User.findOne({ clerkId: req.userId })
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }
  const newComment = new Comment({
    content,
    authorId: user._id,
    postId: comment.postId,
    replies: [],
  })
  await newComment.save()
  comment.replies.push(newComment._id)
  await comment.save()
  return res
    .status(200)
    .json({ message: 'Comment added successfully', data: newComment })
}

module.exports = replyToComment
