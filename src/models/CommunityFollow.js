import mongoose from 'mongoose';

const communityFollowSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

communityFollowSchema.index({ follower: 1, following: 1 }, { unique: true });
communityFollowSchema.index({ following: 1, createdAt: -1 });

const CommunityFollow = mongoose.model('CommunityFollow', communityFollowSchema);

export default CommunityFollow;
