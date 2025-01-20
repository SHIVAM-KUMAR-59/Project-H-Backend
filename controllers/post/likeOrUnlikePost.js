// Like or unlike a post both the actions will be handled here
const Post = require('../../models/Post');
const User = require('../../models/User');

const likeOrUnlikePost = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Post ID is required.",
            });
        }

        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found.",
            });
        }

        const userId = req.user.userId;
        const user = User.findById(userId);

        if (post.likes.includes(userId)) {
            // User already liked the post, so unlike it
            post.likes = post.likes.filter((like) => like !== userId);
            user.likedPosts.pull(id);

            await user.save();
            await post.save();
            
            return res.status(200).json({
                success: true,
                message: "Post unlike successfully.",
            });
        } else {
            // User has not liked the post, so like it
            post.likes.push(userId);
            user.likedPosts.push(id);

            await user.save();
            await post.save();

            return res.status(200).json({
                success: true,
                message: "Post liked successfully.",
            });
        }
    } catch (error) {
        console.error('Error in liking or Unliking the post:', error);
        res.status(500).json({
            success: false,
            message: "An error occurred while liking or unliking the post.",
            error: error.message,
        });
    }
};

module.exports = likeOrUnlikePost;
