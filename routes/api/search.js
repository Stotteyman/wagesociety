// routes/api/search.js — Site-wide search endpoint.
// Returns grouped results: members, pages, content (blog + merch).
// No auth required — public data only.
const express = require('express');
const router = express.Router();
const { searchMembers, searchPosts, searchMerch } = require('../../db/search');

// Static pages available on the site
const PAGES = [
  { name: 'Directory',    url: '/creators',   icon: 'users' },
  { name: 'Marketplace',  url: '/marketplace',icon: 'shopping-bag' },
  { name: 'Streams',      url: '/streams',    icon: 'video' },
  { name: 'Blog',         url: '/news',       icon: 'book' },
  { name: 'Login',        url: '/login',      icon: 'log-in' },
  { name: 'Join',         url: '/join',       icon: 'user-plus' },
  { name: 'Dashboard',    url: '/dashboard',  icon: 'layout' },
];

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json({ members: [], pages: [], content: [] });
  }

  try {
    const [members, posts, merch] = await Promise.all([
      searchMembers(q),
      searchPosts(q),
      searchMerch(q),
    ]);

    // Filter pages by name match
    const pages = PAGES.filter(p =>
      p.name.toLowerCase().includes(q.toLowerCase())
    );

    res.json({
      members: members.map(m => ({
        username:    m.username,
        display_name: m.display_name || m.auth_display_name,
        bio:         m.bio ? m.bio.slice(0, 80) : null,
        avatar_url:  m.avatar_url,
        role:        m.role,
        url:         `/creator/${m.username}`,
      })),
      pages,
      content: [
        ...posts.map(p => ({
          type: 'post',
          id:   p.id,
          title: p.title,
          excerpt: p.excerpt,
          author: p.author_name,
          date: p.created_at,
          url:   `/news/${p.id}`,
        })),
        ...merch.map(m => ({
          type: 'merch',
          id:   m.id,
          name:  m.name,
          price: m.price,
          image: m.image_url,
          url:   `/marketplace#item-${m.id}`,
        })),
      ],
    });
  } catch (err) {
    console.error('[/api/search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;