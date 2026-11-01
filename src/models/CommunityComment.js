import mongoose from 'mongoose';

const communityCommentSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunityPost',
      required: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

communityCommentSchema.index({ post: 1, createdAt: -1 });

const CommunityComment = mongoose.model('CommunityComment', communityCommentSchema);

export default CommunityComment;
