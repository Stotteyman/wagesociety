// db/blog.js — Blog post queries.
// Owns: all CRUD on blog_posts, with permission-keyed helpers.
// Does NOT own: auth/session (handled in routes), rendering (views).
const { pool } = require('./index');

/** Get all published posts (public). */
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

/** Get all posts for a given email (author's own + published). */
async function getAllPosts(email) {
  const result = await pool.query(
    `SELECT * FROM blog_posts
     WHERE author_email = $1 OR is_published = TRUE
     ORDER BY created_at DESC`,
    [email]
  );
  return result.rows;
}

/** Create a post (caller must verify blog.create permission first). */
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

/** Update a post by ID (caller must verify blog.edit permission first). */
async function updatePost(postId, data) {
  const { title, body, image_urls, video_urls, embed_links } = data;
  const result = await pool.query(
    `UPDATE blog_posts
     SET title = COALESCE($2, title),
         body  = COALESCE($3, body),
         image_urls  = COALESCE($4, image_urls),
         video_urls  = COALESCE($5, video_urls),
         embed_links = COALESCE($6, embed_links),
         updated_at  = NOW()
     WHERE id = $1
     RETURNING *`,
    [postId, title, body, image_urls, video_urls, embed_links]
  );
  return result.rows[0] || null;
}

/** Delete a post by ID (caller must verify blog.delete permission first). */
async function deletePost(postId) {
  await pool.query('DELETE FROM blog_posts WHERE id = $1', [postId]);
}

/** Publish / unpublish a post (caller must verify blog.publish permission first). */
async function setPostPublished(postId, isPublished) {
  await pool.query(
    `UPDATE blog_posts SET is_published = $2, updated_at = NOW() WHERE id = $1`,
    [postId, isPublished]
  );
}

/** Get a single post by ID. */
async function getPostById(postId) {
  const result = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [postId]);
  return result.rows[0] || null;
}

/** Delete ALL posts (admin content cleanup). */
async function deleteAllPosts() {
  await pool.query('DELETE FROM blog_posts');
}

module.exports = {
  getPublishedPosts,
  getAllPosts,
  createPost,
  updatePost,
  deletePost,
  setPostPublished,
  getPostById,
  deleteAllPosts,
};