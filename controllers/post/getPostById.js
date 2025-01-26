const Post = require('../../models/Post') // Adjust the path as needed
const Comment = require('../../models/Comment')
// Controller to get a post by ID
const getPostById = async (req, res) => {
  try {
    const { id } = req.params

    // Check if ID is provided
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Post ID is required',
      })
    }

    // Find the post by ID and populate user data
    const post = await Post.findById(id)
      .populate([
        {
          path: 'author',
          select: 'username', // Select only the username field of the author
        },
        {
          path: 'comments', // Populate the comments field
          populate: [
            {
              path: 'authorId',
              select: 'username', // Populate the author of the comment
            },
            {
              path: 'replies', // Populate the replies field (array of Comment references)
              populate: {
                path: 'authorId', // Populate the author of each reply
                select: 'username', // Select the username field of reply authors
              },
            },
          ],
        },
      ])
      .select('author comments')

    // Check if post exists
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      })
    }

    // Respond with the post data
    res.status(200).json({
      success: true,
      message: 'Post retrieved successfully',
      data: post,
    })
  } catch (error) {
    console.error('Error in getPostById:', error)
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the post',
      error: error.message,
    })
  }
}

module.exports = getPostById
