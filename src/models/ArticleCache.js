import mongoose from 'mongoose';

const articleCacheSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 800,
    },

    source: {
      type: String,
      required: true,
      trim: true,
      enum: ['PIB', 'ICAR', 'FAO'],
      index: true,
    },

    sourceUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    imageUrl: {
      type: String,
      default: null,
      trim: true,
    },

    category: {
      type: String,
      default: 'agriculture',
      trim: true,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    cachedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * MongoDB automatically removes documents
 * when expiresAt is reached.
 */
articleCacheSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

/*
 * Latest articles.
 */
articleCacheSchema.index({
  publishedAt: -1,
});

/*
 * Category filtering.
 */
articleCacheSchema.index({
  category: 1,
  publishedAt: -1,
});

/*
 * Source + date queries.
 */
articleCacheSchema.index({
  source: 1,
  publishedAt: -1,
});

const ArticleCache = mongoose.model(
  'ArticleCache',
  articleCacheSchema
);

export default ArticleCache;