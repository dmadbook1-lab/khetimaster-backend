import mongoose from 'mongoose';

/*
 * One row per (user, post, kind). 'like' backs the heart button,
 * 'save' backs the bookmark / Saved tab.
 */
const communityReactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunityPost',
      required: true,
    },

    kind: {
      type: String,
      enum: ['like', 'save'],
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

communityReactionSchema.index({ user: 1, post: 1, kind: 1 }, { unique: true });
communityReactionSchema.index({ user: 1, kind: 1, createdAt: -1 });
communityReactionSchema.index({ post: 1 });

const CommunityReaction = mongoose.model('CommunityReaction', communityReactionSchema);

export default CommunityReaction;
