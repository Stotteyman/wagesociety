// routes/api/news.js — Blog/news API. Permission-gated CRUD.
// Uses new roles system (auth_users.id keyed) via req.user from loadUserPermissions middleware.
// Does NOT own: rendering (pages/news.ejs), old orgAccess (db/orgAccess.js).
const express = require('express');
const router = express.Router();
const { getPublishedPosts, createPost, updatePost, deletePost, setPostPublished, getPostById, deleteAllPosts } = require('../../db/blog');
const { getProfileByEmail } = require('../../db/profiles');

function hasPerm(user, key) {
  return user?.permissions?.includes(key);
}

function requirePerm(key) {
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Authentication required' });
    if (req.user?.isSuspended) return res.status(403).json({ error: 'Account suspended' });
    if (req.user?.isSuperadmin || hasPerm(req.user, key)) return next();
    return res.status(403).json({ error: `Missing permission: ${key}` });
  };
}

// GET /api/news — public published posts
router.get('/', async (_req, res) => {
  try {
    const posts = await getPublishedPosts();
    res.json(posts);
  } catch (err) {
    console.error('[/api/news GET]', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// POST /api/news — create a post (blog.create)
router.post('/', requirePerm('blog.create'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const { title, body, image_urls, video_urls, embed_links } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });

    // Look up profile by email
    const profile = await getProfileByEmail(req.session.userEmail).catch(() => null);
    const post = await createPost({
      title, body,
      author_email: req.session.userEmail,
      author_name: profile?.display_name || req.session.userEmail.split('@')[0],
      image_urls, video_urls, embed_links,
    });
    res.json(post);
  } catch (err) {
    console.error('[/api/news POST]', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// PUT /api/news/:id — update a post (blog.edit; moderators restricted to own posts)
router.put('/:id', requirePerm('blog.edit'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const post = await getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Moderators can only edit their own posts
    const isMod = req.user?.roles?.includes('MODERATOR');
    if (isMod && post.author_id && post.author_id !== userId) {
      return res.status(403).json({ error: 'Moderators can only edit their own posts' });
    }

    const updated = await updatePost(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    console.error('[/api/news PUT]', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/news/:id — delete a post (blog.delete)
router.delete('/:id', requirePerm('blog.delete'), async (req, res) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await deletePost(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[/api/news DELETE]', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// PATCH /api/news/:id/publish — publish or unpublish a post (blog.publish)
router.patch('/:id/publish', requirePerm('blog.publish'), async (req, res) => {
  try {
    const { is_published } = req.body;
    if (typeof is_published !== 'boolean') return res.status(400).json({ error: 'is_published (boolean) required' });
    await setPostPublished(req.params.id, is_published);
    res.json({ ok: true, is_published });
  } catch (err) {
    console.error('[/api/news PATCH publish]', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// POST /api/news/delete-all — delete ALL posts (SUPER_ADMIN only, content cleanup)
router.post('/delete-all', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });
  if (!req.user?.isSuperadmin) return res.status(403).json({ error: 'SUPER_ADMIN role required' });
  try {
    await deleteAllPosts();
    res.json({ ok: true, message: 'All posts deleted' });
  } catch (err) {
    console.error('[/api/news delete-all]', err);
    res.status(500).json({ error: 'Failed to delete posts' });
  }
});

module.exports = router;