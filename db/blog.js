// db/blog.js — Blog post queries.
const { pool } = require('./index');

async function getPublishedPosts() {
  const result = await pool.query(
    `SELECT id, title, body, author_email, author_name, image_urls, video_urls,
            embed_links, created_at
     FROM blog_posts
     WHERE is_published = TRUE
     ORDER BY created_at DESC`
  );
  return result.rows;
}

async function getAllPosts(email) {
  const result = await pool.query(
    `SELECT * FROM blog_posts
     WHERE author_email = $1 OR is_published = TRUE
     ORDER BY created_at DESC`,
    [email]
  );
  return result.rows;
}

async function createPost(data) {
  const { title, body, author_email, author_name, image_urls, video_urls, embed_links } = data;
  const result = await pool.query(
    `INSERT INTO blog_posts (title, body, author_email, author_name, image_urls, video_urls, embed_links, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7, TRUE)
     RETURNING *`,
    [title, body, author_email, author_name || 'WAGE Member', image_urls || [], video_urls || [], embed_links || []]
  );
  return result.rows[0];
}

module.exports = { getPublishedPosts, getAllPosts, createPost };