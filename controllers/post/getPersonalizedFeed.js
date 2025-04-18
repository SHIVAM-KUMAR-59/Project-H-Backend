const Post = require('../../models/Post')
const User = require('../../models/User')

/**
 * Get Home Feed for a user (Following-based)
 */
const getHomeFeed = async (req, res) => {
  try {
    const { id: userId } = req.params
    const { page = 1, limit = 20 } = req.query
    const pageLimit = parseInt(limit)

    console.log('🔍 Fetching feed for user:', userId)

    // Validate MongoDB ObjectId format
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid user ID format' })
    }

    const user = await User.findById(userId).lean()
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    console.log('✅ User found:', user.username)

    const { following, preferences, likedPosts } = user
    const isNewUser = !following?.length && !likedPosts?.length

    let preferredPosts = []
    let followingPosts = []
    let trendingPosts = []
    let tagMatchedPosts = []

    // Fetch posts based on user preferences
    if (preferences?.length) {
      preferredPosts = await Post.find({ category: { $in: preferences } })
        .populate('author', 'username profileImg')
        .populate('comments')
        .sort({ createdAt: -1 })
        .limit(pageLimit)
        .lean()
    }

    // Fetch posts from followed users
    if (following?.length) {
      followingPosts = await Post.find({ author: { $in: following } })
        .populate('author', 'username profileImg')
        .populate('comments')
        .sort({ createdAt: -1 })
        .limit(pageLimit)
        .lean()
    }

    // Fetch trending posts
    trendingPosts = await Post.find({})
      .populate('author', 'username profileImg')
      .populate('comments')
      .sort({ likes: -1, createdAt: -1 })
      .limit(pageLimit)
      .lean()

    // Fetch posts with matching tags from liked posts
    if (likedPosts?.length) {
      const likedPostData = await Post.find({ _id: { $in: likedPosts } }).lean()
      const likedTags = [
        ...new Set(likedPostData.flatMap((post) => post.tags || [])),
      ]

      if (likedTags.length) {
        tagMatchedPosts = await Post.find({ tags: { $in: likedTags } })
          .populate('author', 'username profileImg')
          .populate('comments')
          .sort({ createdAt: -1 })
          .limit(pageLimit)
          .lean()
      }
    }

    // Combine and remove duplicate posts
    const uniquePosts = new Map()
    ;[
      ...preferredPosts,
      ...followingPosts,
      ...trendingPosts,
      ...tagMatchedPosts,
    ].forEach((post) => {
      uniquePosts.set(post._id.toString(), post)
    })

    let sortedPosts = [...uniquePosts.values()].sort((a, b) => {
      const score = (post) =>
        (post.likes?.length || 0) * 3 + (post.comments?.length || 0) * 2
      return score(b) - score(a)
    })

    // Avoid consecutive posts from the same author
    let finalFeed = []
    let authorLastPost = new Map()

    for (let post of sortedPosts) {
      if (!post.author?._id) continue

      if (
        !authorLastPost.has(post.author._id.toString()) ||
        finalFeed.length - authorLastPost.get(post.author._id.toString()) > 3
      ) {
        finalFeed.push(post)
        authorLastPost.set(post.author._id.toString(), finalFeed.length - 1)
      }
    }

    console.log(`✅ Returning ${finalFeed.length} posts in home feed.`)
    res.status(200).json({ feed: finalFeed, currentPage: page })
  } catch (error) {
    console.error('❌ Error fetching home feed:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * Get Explore Feed for a user (Engagement-based)
 */
const getExploreFeed = async (req, res) => {
  try {
    const { id: userId } = req.params
    const { page = 1, limit = 20 } = req.query
    const pageLimit = parseInt(limit)

    console.log('🔍 Fetching explore feed for user:', userId)

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid user ID format' })
    }

    const user = await User.findById(userId).lean()
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const { likedPosts, preferences } = user
    let likedTags = new Set()

    if (likedPosts?.length) {
      const likedPostData = await Post.find({ _id: { $in: likedPosts } }).lean()
      likedPostData.forEach((post) =>
        post.tags?.forEach((tag) => likedTags.add(tag)),
      )
    }

    // Fetch posts based on engagement (likes, category, preferences)
    let posts = await Post.find({
      $or: [
        { tags: { $in: [...likedTags] } },
        { category: { $in: preferences } },
      ],
    })
      .populate('author', 'username profileImg')
      .populate('comments')
      .sort({ likes: -1, comments: -1, createdAt: -1 })
      .lean()

    let finalFeed = []
    let authorLastPost = new Map()

    for (let post of posts) {
      if (!post.author?._id) continue

      if (
        !authorLastPost.has(post.author._id.toString()) ||
        finalFeed.length - authorLastPost.get(post.author._id.toString()) > 3
      ) {
        finalFeed.push(post)
        authorLastPost.set(post.author._id.toString(), finalFeed.length - 1)
      }

      if (finalFeed.length >= pageLimit) break
    }

    console.log(`✅ Returning ${finalFeed.length} posts in explore feed.`)
    res.status(200).json({ feed: finalFeed.slice(0, pageLimit) })
  } catch (error) {
    console.error('❌ Error fetching explore feed:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

module.exports = { getHomeFeed, getExploreFeed }
