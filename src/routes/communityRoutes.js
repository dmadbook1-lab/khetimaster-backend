import express from 'express';

import {
  getFeed,
  getReelCreators,
  createPost,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  viewPost,
  sharePost,
  getSavedPosts,
  getComments,
  addComment,
  deleteComment,
  getProfile,
  getUserPosts,
  updateMyProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  search,
} from '../controllers/communityController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| FEED / DISCOVERY
|--------------------------------------------------------------------------
*/

router.get('/feed', getFeed);

router.get('/reel-creators', getReelCreators);

router.get('/search', search);

router.get('/saved', getSavedPosts);

/*
|--------------------------------------------------------------------------
| POSTS
|--------------------------------------------------------------------------
*/

router.post('/posts', createPost);

router.get('/posts/:id', getPostById);

router.patch('/posts/:id', updatePost);

router.delete('/posts/:id', deletePost);

router.post('/posts/:id/like', likePost);

router.delete('/posts/:id/like', unlikePost);

router.post('/posts/:id/save', savePost);

router.delete('/posts/:id/save', unsavePost);

router.post('/posts/:id/view', viewPost);

router.post('/posts/:id/share', sharePost);

/*
|--------------------------------------------------------------------------
| COMMENTS
|--------------------------------------------------------------------------
*/

router.get('/posts/:id/comments', getComments);

router.post('/posts/:id/comments', addComment);

router.delete('/comments/:id', deleteComment);

/*
|--------------------------------------------------------------------------
| PROFILES / FOLLOW
|--------------------------------------------------------------------------
*/

router.put('/profile', updateMyProfile);

router.get('/users/:userId', getProfile);

router.get('/users/:userId/posts', getUserPosts);

router.get('/users/:userId/followers', getFollowers);

router.get('/users/:userId/following', getFollowing);

router.post('/users/:userId/follow', followUser);

router.delete('/users/:userId/follow', unfollowUser);

export default router;
