// db/search.js — Site-wide search queries.
// Owns: member/profiles/blog/merch ILIKE search results.
// Does NOT own: API routing (routes/api/search.js), rendering.
const { pool } = require('./index');

const LIMIT = 5;

/** Search members by username, display_name, bio (auth_users + member_profiles join). */
async function searchMembers(query) {
  const pat = `%${query}%`;
  const result = await pool.query(
    `SELECT p.username, p.display_name, p.bio, p.avatar_url, p.role, p.email,
            a.display_name AS auth_display_name
     FROM member_profiles p
     LEFT JOIN auth_users a ON a.email = p.email
     WHERE p.username ILIKE $1
        OR p.display_name ILIKE $1
        OR p.bio ILIKE $1
     ORDER BY
       CASE WHEN p.username ILIKE $2 THEN 0 ELSE 1 END,
       p.created_at DESC
     LIMIT $3`,
    [pat, query, LIMIT]
  );
  return result.rows;
}

/** Search blog posts by title and body. */
async function searchPosts(query) {
  const pat = `%${query}%`;
  const result = await pool.query(
    `SELECT id, title, author_name, created_at,
            LEFT(body, 120) AS excerpt
     FROM blog_posts
     WHERE is_published = TRUE
       AND (title ILIKE $1 OR body ILIKE $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [pat, LIMIT]
  );
  return result.rows;
}

/** Search merch items by name and description. */
async function searchMerch(query) {
  const pat = `%${query}%`;
  const result = await pool.query(
    `SELECT id, name, description, price, image_url
     FROM merch_items
     WHERE is_active = TRUE
       AND (name ILIKE $1 OR description ILIKE $1)
     ORDER BY created_at ASC
     LIMIT $2`,
    [pat, LIMIT]
  );
  return result.rows;
}

module.exports = { searchMembers, searchPosts, searchMerch };