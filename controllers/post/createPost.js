// Create a post
const Post = require('../../models/Post')
const User = require('../../models/User')

const createPost = async (req, res) => {
  const { id } = req.params
  if (!id) {
    return res.status(400).json({ message: 'User Id is Required' })
  }
  try {
    const { category, image, caption } = req.body

    if (!caption || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing Required Fields.',
      })
    }

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ message: 'User Not Found' })
    }

    const newPost = new Post({
      image: image || null,
      caption: caption,
      category: category,
      author: user._id, // Assign the post to the authenticated user
    })

    user.posts.push(newPost._id)

    const savedPost = await newPost.save()
    await user.save()

    res.status(201).json({
      success: true,
      message: 'Post created successfully.',
      data: savedPost,
    })
  } catch (error) {
    console.error('Error in createPost:', error)
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the post.',
      error: error.message,
    })
  }
}

module.exports = createPost
