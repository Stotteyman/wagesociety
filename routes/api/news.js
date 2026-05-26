// routes/api/news.js — Blog/news API.
const express = require('express');
const router = express.Router();
const { getPublishedPosts, createPost } = require('../../db/blog');
const { getMemberAccess } = require('../../db/profiles');

router.get('/', async (_req, res) => {
  try {
    const posts = await getPublishedPosts();
    res.json(posts);
  } catch (err) {
    console.error('[/api/news]', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

router.post('/', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Authentication required' });
    const access = await getMemberAccess(email);
    const allowed = new Set(['superadmin','admin','manager','staff','helper','user']);
    if (!allowed.has(access.role) || access.role === 'banned') {
      return res.status(403).json({ error: 'Not authorized to post' });
    }
    const { title, body, image_urls, video_urls, embed_links } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const profile = await require('../../db/profiles').getProfileByEmail(email);
    const post = await createPost({
      title, body, author_email: email,
      author_name: profile?.display_name || email.split('@')[0],
      image_urls, video_urls, embed_links,
    });
    res.json(post);
  } catch (err) {
    console.error('[/api/news POST]', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

module.exports = router;