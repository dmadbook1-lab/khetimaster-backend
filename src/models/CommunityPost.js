import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },

    // Poster frame for videos (Cloudinary can render one from the video)
    thumbnailUrl: {
      type: String,
      default: '',
      trim: true,
    },

    width: {
      type: Number,
      default: null,
    },

    height: {
      type: Number,
      default: null,
    },

    // Seconds, videos only
    duration: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

/*
 * A community post. 'post' is a feed post with 1-10 photos / videos,
 * 'reel' is a single vertical video shown in the Reels player.
 */
const communityPostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ['post', 'reel'],
      required: true,
    },

    caption: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2200,
    },

    media: {
      type: [mediaSchema],
      default: [],
    },

    // Lowercase, without the leading '#'
    hashtags: {
      type: [String],
      default: [],
      index: true,
    },

    location: {
      type: String,
      default: '',
      trim: true,
    },

    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    savesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    viewsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    sharesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

communityPostSchema.index({ type: 1, createdAt: -1 });
communityPostSchema.index({ author: 1, type: 1, createdAt: -1 });

const CommunityPost = mongoose.model('CommunityPost', communityPostSchema);

export default CommunityPost;
