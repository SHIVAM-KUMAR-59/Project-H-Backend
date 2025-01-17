const Post = require('../../models/Post')
const User = require('../../models/User')

/**
 * @Params:
 *  - req: The request object, which should include:
 *      - params.id: The ID of the user creating the post.
 *      - body: The request body containing:
 *          - category (string): The category of the post (required).
 *          - image (string, optional): The URL of the image for the post.
 *          - caption (string): The caption for the post (required).
 *  - res: The response object used to send back the appropriate HTTP response.
 *
 * @Returns:
 *  - If successful:
 *      - Status 201: JSON object containing:
 *          - success (boolean): Indicates the operation was successful.
 *          - message (string): A success message.
 *          - data (object): The created post object.
 *  - If failed:
 *      - Status 400: JSON object indicating a bad request due to missing fields or parameters.
 *      - Status 404: JSON object indicating the user was not found.
 *      - Status 500: JSON object indicating an internal server error.
 */

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
