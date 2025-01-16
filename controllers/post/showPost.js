const User = require('../../models/User')
const Post = require('../../models/Post') // Ensure Post model is imported

// Optimized controller to fetch posts for the user
const showPost = async (req, res) => {
  const { id } = req.body

  if (!id) {
    return res.status(400).json({ message: 'User Id is required' })
  }

  try {
    // Fetch user and only required fields using projection
    const user = await User.findById(id)
      .populate('savedPosts likedPosts following')
      .select('savedPosts likedPosts following preferences')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Extract relevant IDs and tags
    const savedPostsTags = user.savedPosts.flatMap((post) => post.tags)
    const likedPostsTags = user.likedPosts.flatMap((post) => post.tags)
    const followedUserIds = user.following.map((follow) => follow._id)
    const likedPostIds = user.likedPosts.map((post) => post._id)

    // Build query for fetching relevant posts
    const postsQuery = {
      $or: [
        {
          tags: {
            $in: [...savedPostsTags, ...likedPostsTags, ...user.preferences],
          },
        },
        { author: { $in: followedUserIds } },
      ],
    }

    // Fetch all relevant posts with a single query
    const allPosts = await Post.find(postsQuery).select('tags author')

    // Separate posts by followed users and exclude already liked posts
    const followedPostsNotLiked = allPosts.filter(
      (post) =>
        followedUserIds.includes(post.author.toString()) &&
        !likedPostIds.includes(post._id.toString()),
    )

    // Combine all sources for the final list
    const postsToBeShown = [...new Set([...allPosts, ...followedPostsNotLiked])]

    return res
      .status(200)
      .json({ message: 'Posts Fetched Successfully', posts: postsToBeShown })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

export default showPost
