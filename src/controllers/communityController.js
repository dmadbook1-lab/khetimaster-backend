import mongoose from 'mongoose';

import CommunityPost from '../models/CommunityPost.js';
import CommunityComment from '../models/CommunityComment.js';
import CommunityReaction from '../models/CommunityReaction.js';
import CommunityFollow from '../models/CommunityFollow.js';
import User from '../models/User.js';

const AUTHOR_FIELDS = 'fullName avatar bio village district state';

const POST_TYPES = ['post', 'reel'];

const MAX_POST_MEDIA = 10;

const MAX_CAPTION = 2200;

const MAX_COMMENT = 1000;

const MAX_BIO = 150;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getUserId = (req) => req.user?.userId || null;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());

const getPaging = (query, defaultLimit = 12) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 50);

  return { page, limit, skip: (page - 1) * limit };
};

/*
 * '#ZeroTill and #गेहूं' -> ['zerotill', 'गेहूं']
 * Includes \p{M} so Devanagari vowel signs stay part of the tag.
 */
const extractHashtags = (caption) => {
  const tags = caption.match(/#[\p{L}\p{M}\p{N}_]+/gu) || [];

  return [...new Set(tags.map((tag) => tag.slice(1).toLowerCase()))].slice(0, 30);
};

const formatLocation = (user) =>
  [user?.village, user?.district, user?.state].filter(Boolean).slice(-2).join(', ');

const publicUser = (user) => ({
  _id: user._id,
  fullName: user.fullName || 'Farmer',
  avatar: user.avatar || '',
  bio: user.bio || '',
  location: formatLocation(user),
});

/*
 * Validates the media list for a new post.
 *
 * Returns { media } or { error }.
 */
const buildMedia = (type, body) => {
  if (!Array.isArray(body.media) || body.media.length === 0) {
    return { error: type === 'reel' ? 'A video is required for a reel' : 'Add at least one photo or video' };
  }

  if (type === 'reel' && body.media.length !== 1) {
    return { error: 'A reel must have exactly one video' };
  }

  if (body.media.length > MAX_POST_MEDIA) {
    return { error: `A post can have at most ${MAX_POST_MEDIA} photos or videos` };
  }

  const media = [];

  for (const item of body.media) {
    if (!item || !isHttpUrl(item.url)) {
      return { error: 'Every media item needs a valid URL' };
    }

    if (!['image', 'video'].includes(item.type)) {
      return { error: 'Media type must be image or video' };
    }

    if (type === 'reel' && item.type !== 'video') {
      return { error: 'A reel must be a video' };
    }

    const toNumber = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

    media.push({
      url: item.url.trim(),
      type: item.type,
      thumbnailUrl: isHttpUrl(item.thumbnailUrl) ? item.thumbnailUrl.trim() : '',
      width: toNumber(item.width),
      height: toNumber(item.height),
      duration: toNumber(item.duration),
    });
  }

  return { media };
};

/*
 * Adds the viewer-specific flags the app needs to render posts:
 * isLiked, isSaved, isMine and author.isFollowing.
 */
const decoratePosts = async (posts, userId) => {
  if (!posts.length) return [];

  const postIds = posts.map((post) => post._id);
  const authorIds = [...new Set(posts.map((post) => String(post.author?._id || post.author)))];

  const [reactions, follows] = await Promise.all([
    CommunityReaction.find({ user: userId, post: { $in: postIds } })
      .select('post kind')
      .lean(),
    CommunityFollow.find({ follower: userId, following: { $in: authorIds } })
      .select('following')
      .lean(),
  ]);

  const liked = new Set(reactions.filter((r) => r.kind === 'like').map((r) => String(r.post)));
  const saved = new Set(reactions.filter((r) => r.kind === 'save').map((r) => String(r.post)));
  const followed = new Set(follows.map((f) => String(f.following)));

  return posts.map((post) => {
    const author = post.author && post.author._id ? post.author : { _id: post.author };
    const authorId = String(author._id);

    return {
      ...post,
      author: {
        ...publicUser(author),
        isFollowing: followed.has(authorId),
      },
      isMine: authorId === String(userId),
      isLiked: liked.has(String(post._id)),
      isSaved: saved.has(String(post._id)),
    };
  });
};

const findPosts = (filter, { skip, limit }) =>
  CommunityPost.find(filter).populate('author', AUTHOR_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

const sendPostPage = async (res, userId, filter, paging) => {
  const [posts, total] = await Promise.all([findPosts(filter, paging), CommunityPost.countDocuments(filter)]);

  return res.status(200).json({
    success: true,
    count: posts.length,
    total,
    page: paging.page,
    pages: Math.ceil(total / paging.limit),
    posts: await decoratePosts(posts, userId),
  });
};

const serverError = (res, label, message, error) => {
  console.error(`${label}:`, error);

  return res.status(500).json({ success: false, message, error: error.message });
};

/*
|--------------------------------------------------------------------------
| FEED
|--------------------------------------------------------------------------
|
| GET /api/community/feed
|
|   type     post | reel   (default: both)
|   scope    all | following
|   hashtag  only posts with this tag
|   page, limit
|
*/

export const getFeed = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { type, scope, hashtag } = req.query;

    const filter = {};

    if (POST_TYPES.includes(type)) filter.type = type;

    if (hashtag) filter.hashtags = trimString(hashtag).replace(/^#/, '').toLowerCase();

    if (scope === 'following') {
      const follows = await CommunityFollow.find({ follower: userId }).select('following').lean();

      filter.author = { $in: [...follows.map((f) => f.following), userId] };
    }

    return await sendPostPage(res, userId, filter, getPaging(req.query, type === 'reel' ? 8 : 12));
  } catch (error) {
    return serverError(res, 'GET COMMUNITY FEED ERROR', 'Failed to load feed', error);
  }
};

/*
 * GET /api/community/reel-creators
 *
 * People who posted a reel recently, newest first - the story-style row
 * at the top of the feed.
 */
export const getReelCreators = async (req, res) => {
  try {
    const userId = getUserId(req);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const rows = await CommunityPost.aggregate([
      { $match: { type: 'reel', createdAt: { $gte: since } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$author', latestReel: { $first: '$_id' }, latestAt: { $first: '$createdAt' }, reels: { $sum: 1 } } },
      { $sort: { latestAt: -1 } },
      { $limit: 20 },
    ]);

    const users = await User.find({ _id: { $in: rows.map((row) => row._id) } })
      .select(AUTHOR_FIELDS)
      .lean();

    const usersById = new Map(users.map((user) => [String(user._id), user]));

    return res.status(200).json({
      success: true,
      creators: rows
        .filter((row) => usersById.has(String(row._id)))
        .map((row) => ({
          ...publicUser(usersById.get(String(row._id))),
          isMe: String(row._id) === String(userId),
          latestReel: row.latestReel,
          reels: row.reels,
        })),
    });
  } catch (error) {
    return serverError(res, 'GET REEL CREATORS ERROR', 'Failed to load reel creators', error);
  }
};

/*
|--------------------------------------------------------------------------
| POSTS
|--------------------------------------------------------------------------
*/

/*
 * POST /api/community/posts
 *
 * { type: 'post' | 'reel', caption, location, media: [{url, type, thumbnailUrl, width, height, duration}] }
 *
 * Media is uploaded to Cloudinary by the app first; only URLs are sent here.
 */
export const createPost = async (req, res) => {
  try {
    const userId = getUserId(req);
    const type = req.body.type;

    if (!POST_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be post or reel' });
    }

    const caption = trimString(req.body.caption);

    if (caption.length > MAX_CAPTION) {
      return res.status(400).json({ success: false, message: `Caption must be at most ${MAX_CAPTION} characters` });
    }

    const { media, error } = buildMedia(type, req.body);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const post = await CommunityPost.create({
      author: userId,
      type,
      caption,
      media,
      hashtags: extractHashtags(caption),
      location: trimString(req.body.location).slice(0, 100),
    });

    const populated = await CommunityPost.findById(post._id).populate('author', AUTHOR_FIELDS).lean();
    const [decorated] = await decoratePosts([populated], userId);

    return res.status(201).json({
      success: true,
      message: type === 'reel' ? 'Reel shared' : 'Post shared',
      post: decorated,
    });
  } catch (error) {
    return serverError(res, 'CREATE COMMUNITY POST ERROR', 'Failed to share post', error);
  }
};

/*
 * GET /api/community/posts/:id
 */
export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await CommunityPost.findById(id).populate('author', AUTHOR_FIELDS).lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const [decorated] = await decoratePosts([post], getUserId(req));

    return res.status(200).json({ success: true, post: decorated });
  } catch (error) {
    return serverError(res, 'GET COMMUNITY POST ERROR', 'Failed to load post', error);
  }
};

/*
 * PATCH /api/community/posts/:id
 *
 * Only the caption and location can be edited.
 */
export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await CommunityPost.findOne({ _id: id, author: getUserId(req) });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (req.body.caption !== undefined) {
      const caption = trimString(req.body.caption);

      if (caption.length > MAX_CAPTION) {
        return res.status(400).json({ success: false, message: `Caption must be at most ${MAX_CAPTION} characters` });
      }

      post.caption = caption;
      post.hashtags = extractHashtags(caption);
    }

    if (req.body.location !== undefined) {
      post.location = trimString(req.body.location).slice(0, 100);
    }

    await post.save();

    const populated = await CommunityPost.findById(post._id).populate('author', AUTHOR_FIELDS).lean();
    const [decorated] = await decoratePosts([populated], getUserId(req));

    return res.status(200).json({ success: true, message: 'Post updated', post: decorated });
  } catch (error) {
    return serverError(res, 'UPDATE COMMUNITY POST ERROR', 'Failed to update post', error);
  }
};

/*
 * DELETE /api/community/posts/:id
 */
export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await CommunityPost.findOneAndDelete({ _id: id, author: getUserId(req) });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    await Promise.all([CommunityComment.deleteMany({ post: id }), CommunityReaction.deleteMany({ post: id })]);

    return res.status(200).json({ success: true, message: 'Post deleted', postId: id });
  } catch (error) {
    return serverError(res, 'DELETE COMMUNITY POST ERROR', 'Failed to delete post', error);
  }
};

/*
|--------------------------------------------------------------------------
| LIKE / SAVE / VIEW / SHARE
|--------------------------------------------------------------------------
|
| POST adds, DELETE removes. Both are idempotent and return the fresh
| counts so the app can settle its optimistic update.
|
*/

const COUNTER_FOR = { like: 'likesCount', save: 'savesCount' };

const setReaction = (kind, active) => async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    if (!(await CommunityPost.exists({ _id: id }))) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    let changed = false;

    if (active) {
      const result = await CommunityReaction.updateOne(
        { user: userId, post: id, kind },
        { $setOnInsert: { user: userId, post: id, kind } },
        { upsert: true },
      );

      changed = result.upsertedCount > 0;
    } else {
      const result = await CommunityReaction.deleteOne({ user: userId, post: id, kind });

      changed = result.deletedCount > 0;
    }

    const counter = COUNTER_FOR[kind];

    const post = changed
      ? await CommunityPost.findByIdAndUpdate(id, { $inc: { [counter]: active ? 1 : -1 } }, { returnDocument: 'after' }).lean()
      : await CommunityPost.findById(id).lean();

    return res.status(200).json({
      success: true,
      postId: id,
      [kind === 'like' ? 'isLiked' : 'isSaved']: active,
      likesCount: Math.max(post.likesCount, 0),
      savesCount: Math.max(post.savesCount, 0),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ success: true, postId: req.params.id });
    }

    return serverError(res, `COMMUNITY ${kind.toUpperCase()} ERROR`, `Failed to update ${kind}`, error);
  }
};

export const likePost = setReaction('like', true);
export const unlikePost = setReaction('like', false);
export const savePost = setReaction('save', true);
export const unsavePost = setReaction('save', false);

const bumpCounter = (counter) => async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await CommunityPost.findByIdAndUpdate(id, { $inc: { [counter]: 1 } }, { returnDocument: 'after' })
      .select(counter)
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    return res.status(200).json({ success: true, postId: id, [counter]: post[counter] });
  } catch (error) {
    return serverError(res, 'COMMUNITY COUNTER ERROR', 'Failed to update post', error);
  }
};

export const viewPost = bumpCounter('viewsCount');
export const sharePost = bumpCounter('sharesCount');

/*
 * GET /api/community/saved
 *
 * The signed-in user's saved posts and reels, most recently saved first.
 */
export const getSavedPosts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const paging = getPaging(req.query, 18);

    const filter = { user: userId, kind: 'save' };

    const [saves, total] = await Promise.all([
      CommunityReaction.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
      CommunityReaction.countDocuments(filter),
    ]);

    const posts = await CommunityPost.find({ _id: { $in: saves.map((save) => save.post) } })
      .populate('author', AUTHOR_FIELDS)
      .lean();

    const postsById = new Map(posts.map((post) => [String(post._id), post]));
    const ordered = saves.map((save) => postsById.get(String(save.post))).filter(Boolean);

    return res.status(200).json({
      success: true,
      count: ordered.length,
      total,
      page: paging.page,
      pages: Math.ceil(total / paging.limit),
      posts: await decoratePosts(ordered, userId),
    });
  } catch (error) {
    return serverError(res, 'GET SAVED COMMUNITY POSTS ERROR', 'Failed to load saved posts', error);
  }
};

/*
|--------------------------------------------------------------------------
| COMMENTS
|--------------------------------------------------------------------------
*/

const formatComment = (comment, userId, postAuthorId) => ({
  _id: comment._id,
  text: comment.text,
  createdAt: comment.createdAt,
  author: publicUser(comment.author || {}),
  canDelete: [String(comment.author?._id), String(postAuthorId)].includes(String(userId)),
});

/*
 * GET /api/community/posts/:id/comments
 */
export const getComments = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await CommunityPost.findById(id).select('author').lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const paging = getPaging(req.query, 30);

    const [comments, total] = await Promise.all([
      CommunityComment.find({ post: id })
        .populate('author', AUTHOR_FIELDS)
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .lean(),
      CommunityComment.countDocuments({ post: id }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: paging.page,
      pages: Math.ceil(total / paging.limit),
      comments: comments.map((comment) => formatComment(comment, userId, post.author)),
    });
  } catch (error) {
    return serverError(res, 'GET COMMUNITY COMMENTS ERROR', 'Failed to load comments', error);
  }
};

/*
 * POST /api/community/posts/:id/comments  { text }
 */
export const addComment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const text = trimString(req.body.text);

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment cannot be empty' });
    }

    if (text.length > MAX_COMMENT) {
      return res.status(400).json({ success: false, message: `Comment must be at most ${MAX_COMMENT} characters` });
    }

    const post = await CommunityPost.findByIdAndUpdate(id, { $inc: { commentsCount: 1 } }, { returnDocument: 'after' })
      .select('author commentsCount')
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = await CommunityComment.create({ post: id, author: userId, text });
    const populated = await CommunityComment.findById(comment._id).populate('author', AUTHOR_FIELDS).lean();

    return res.status(201).json({
      success: true,
      postId: id,
      commentsCount: post.commentsCount,
      comment: formatComment(populated, userId, post.author),
    });
  } catch (error) {
    return serverError(res, 'ADD COMMUNITY COMMENT ERROR', 'Failed to add comment', error);
  }
};

/*
 * DELETE /api/community/comments/:id
 *
 * The comment's author or the post's author can delete it.
 */
export const deleteComment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const comment = await CommunityComment.findById(id).lean();

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const post = await CommunityPost.findById(comment.post).select('author').lean();

    const allowed = [String(comment.author), String(post?.author)].includes(String(userId));

    if (!allowed) {
      return res.status(403).json({ success: false, message: 'You cannot delete this comment' });
    }

    await CommunityComment.deleteOne({ _id: id });

    const updated = post
      ? await CommunityPost.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -1 } }, { returnDocument: 'after' })
          .select('commentsCount')
          .lean()
      : null;

    return res.status(200).json({
      success: true,
      commentId: id,
      postId: comment.post,
      commentsCount: Math.max(updated?.commentsCount || 0, 0),
    });
  } catch (error) {
    return serverError(res, 'DELETE COMMUNITY COMMENT ERROR', 'Failed to delete comment', error);
  }
};

/*
|--------------------------------------------------------------------------
| PROFILES
|--------------------------------------------------------------------------
*/

/*
 * GET /api/community/users/:userId
 *
 * Profile header: user info, counts and whether the viewer follows them.
 */
export const getProfile = async (req, res) => {
  try {
    const viewerId = getUserId(req);
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(userId).select(AUTHOR_FIELDS).lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const authorId = new mongoose.Types.ObjectId(String(userId));

    const [postsCount, reelsCount, followers, following, isFollowing, followsYou, likes] = await Promise.all([
      CommunityPost.countDocuments({ author: userId, type: 'post' }),
      CommunityPost.countDocuments({ author: userId, type: 'reel' }),
      CommunityFollow.countDocuments({ following: userId }),
      CommunityFollow.countDocuments({ follower: userId }),
      CommunityFollow.exists({ follower: viewerId, following: userId }),
      CommunityFollow.exists({ follower: userId, following: viewerId }),
      CommunityPost.aggregate([{ $match: { author: authorId } }, { $group: { _id: null, total: { $sum: '$likesCount' } } }]),
    ]);

    return res.status(200).json({
      success: true,
      profile: {
        ...publicUser(user),
        isMe: String(userId) === String(viewerId),
        isFollowing: Boolean(isFollowing),
        followsYou: Boolean(followsYou),
        stats: {
          posts: postsCount + reelsCount,
          reels: reelsCount,
          followers,
          following,
          likes: likes[0]?.total || 0,
        },
      },
    });
  } catch (error) {
    return serverError(res, 'GET COMMUNITY PROFILE ERROR', 'Failed to load profile', error);
  }
};

/*
 * GET /api/community/users/:userId/posts?type=post|reel
 */
export const getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const filter = { author: userId };

    if (POST_TYPES.includes(req.query.type)) filter.type = req.query.type;

    return await sendPostPage(res, getUserId(req), filter, getPaging(req.query, 18));
  } catch (error) {
    return serverError(res, 'GET USER COMMUNITY POSTS ERROR', 'Failed to load posts', error);
  }
};

/*
 * PUT /api/community/profile  { bio, avatar }
 *
 * Name and location are edited through the main profile screen.
 */
export const updateMyProfile = async (req, res) => {
  try {
    const update = {};

    if (req.body.bio !== undefined) {
      const bio = trimString(req.body.bio);

      if (bio.length > MAX_BIO) {
        return res.status(400).json({ success: false, message: `Bio must be at most ${MAX_BIO} characters` });
      }

      update.bio = bio;
    }

    if (req.body.avatar !== undefined) {
      const avatar = trimString(req.body.avatar);

      if (avatar && !isHttpUrl(avatar)) {
        return res.status(400).json({ success: false, message: 'Invalid profile photo URL' });
      }

      update.avatar = avatar;
    }

    const user = await User.findByIdAndUpdate(getUserId(req), { $set: update }, { returnDocument: 'after' })
      .select(AUTHOR_FIELDS)
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, message: 'Profile updated', user: publicUser(user) });
  } catch (error) {
    return serverError(res, 'UPDATE COMMUNITY PROFILE ERROR', 'Failed to update profile', error);
  }
};

/*
|--------------------------------------------------------------------------
| FOLLOW
|--------------------------------------------------------------------------
*/

export const followUser = async (req, res) => {
  try {
    const viewerId = getUserId(req);
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (String(userId) === String(viewerId)) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    if (!(await User.exists({ _id: userId }))) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await CommunityFollow.updateOne(
      { follower: viewerId, following: userId },
      { $setOnInsert: { follower: viewerId, following: userId } },
      { upsert: true },
    );

    const followers = await CommunityFollow.countDocuments({ following: userId });

    return res.status(200).json({ success: true, userId, isFollowing: true, followers });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ success: true, userId: req.params.userId, isFollowing: true });
    }

    return serverError(res, 'FOLLOW USER ERROR', 'Failed to follow', error);
  }
};

export const unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    await CommunityFollow.deleteOne({ follower: getUserId(req), following: userId });

    const followers = await CommunityFollow.countDocuments({ following: userId });

    return res.status(200).json({ success: true, userId, isFollowing: false, followers });
  } catch (error) {
    return serverError(res, 'UNFOLLOW USER ERROR', 'Failed to unfollow', error);
  }
};

/*
 * GET /api/community/users/:userId/followers
 * GET /api/community/users/:userId/following
 */
const listFollows = (direction) => async (req, res) => {
  try {
    const viewerId = getUserId(req);
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // followers: rows where they are followed; following: rows where they follow
    const [matchKey, userKey] = direction === 'followers' ? ['following', 'follower'] : ['follower', 'following'];

    const paging = getPaging(req.query, 30);
    const filter = { [matchKey]: userId };

    const [rows, total] = await Promise.all([
      CommunityFollow.find(filter)
        .populate(userKey, AUTHOR_FIELDS)
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .lean(),
      CommunityFollow.countDocuments(filter),
    ]);

    const users = rows.map((row) => row[userKey]).filter(Boolean);

    const viewerFollows = await CommunityFollow.find({
      follower: viewerId,
      following: { $in: users.map((user) => user._id) },
    })
      .select('following')
      .lean();

    const followed = new Set(viewerFollows.map((f) => String(f.following)));

    return res.status(200).json({
      success: true,
      total,
      page: paging.page,
      pages: Math.ceil(total / paging.limit),
      users: users.map((user) => ({
        ...publicUser(user),
        isMe: String(user._id) === String(viewerId),
        isFollowing: followed.has(String(user._id)),
      })),
    });
  } catch (error) {
    return serverError(res, 'LIST FOLLOWS ERROR', `Failed to load ${direction}`, error);
  }
};

export const getFollowers = listFollows('followers');
export const getFollowing = listFollows('following');

/*
|--------------------------------------------------------------------------
| SEARCH
|--------------------------------------------------------------------------
|
| GET /api/community/search?q=
|
| Accounts by name / place, and posts by hashtag or caption.
|
*/

export const search = async (req, res) => {
  try {
    const viewerId = getUserId(req);
    const q = trimString(req.query.q).replace(/^#/, '');

    if (!q) {
      return res.status(200).json({ success: true, users: [], posts: [], hashtags: [] });
    }

    const pattern = new RegExp(escapeRegex(q), 'i');

    const [users, posts, hashtags] = await Promise.all([
      User.find({ $or: [{ fullName: pattern }, { village: pattern }, { district: pattern }] })
        .select(AUTHOR_FIELDS)
        .limit(20)
        .lean(),
      CommunityPost.find({ $or: [{ hashtags: q.toLowerCase() }, { caption: pattern }] })
        .populate('author', AUTHOR_FIELDS)
        .sort({ likesCount: -1, createdAt: -1 })
        .limit(30)
        .lean(),
      CommunityPost.aggregate([
        { $match: { hashtags: { $regex: `^${escapeRegex(q.toLowerCase())}` } } },
        { $unwind: '$hashtags' },
        { $match: { hashtags: { $regex: `^${escapeRegex(q.toLowerCase())}` } } },
        { $group: { _id: '$hashtags', posts: { $sum: 1 } } },
        { $sort: { posts: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const follows = await CommunityFollow.find({
      follower: viewerId,
      following: { $in: users.map((user) => user._id) },
    })
      .select('following')
      .lean();

    const followed = new Set(follows.map((f) => String(f.following)));

    return res.status(200).json({
      success: true,
      users: users.map((user) => ({
        ...publicUser(user),
        isMe: String(user._id) === String(viewerId),
        isFollowing: followed.has(String(user._id)),
      })),
      posts: await decoratePosts(posts, viewerId),
      hashtags: hashtags.map((tag) => ({ tag: tag._id, posts: tag.posts })),
    });
  } catch (error) {
    return serverError(res, 'COMMUNITY SEARCH ERROR', 'Search failed', error);
  }
};
