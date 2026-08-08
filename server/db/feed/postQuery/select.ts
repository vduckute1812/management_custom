/**
 * Feed/post SELECT. Shared-post columns are only populated when the JOIN
 * ACL matches — otherwise `sp.*` is NULL and hydration omits the preview
 * body (wrapper post still visible under its own ACL).
 */
export function buildPostSelect(sharedAclSql: string): string {
  return `
  SELECT
    p.id,
    p.user_id,
    p.body,
    p.format,
    p.title,
    p.visibility,
    p.category_id,
    p.font_family,
    p.text_color,
    p.shared_post_id,
    p.translation_group_id,
    p.content_locale,
    p.created_at,
    p.updated_at,
    u.name AS author_name,
    u.email AS author_email,
    u.avatar_upload_id AS author_avatar_upload_id,
    u.title AS author_title,
    u.job AS author_job,
    u.location AS author_location,
    p.comment_count AS comment_count,
    c.slug AS category_slug,
    c.name AS category_name,
    c.sort_order AS category_sort_order,
    sp.body AS shared_body,
    sp.title AS shared_title,
    sp.format AS shared_format,
    sp.created_at AS shared_created_at,
    su.id AS shared_author_id,
    su.name AS shared_author_name,
    su.email AS shared_author_email,
    su.avatar_upload_id AS shared_author_avatar_upload_id,
    su.title AS shared_author_title,
    su.job AS shared_author_job,
    su.location AS shared_author_location
  FROM posts p
  INNER JOIN users u ON u.id = p.user_id
  LEFT JOIN post_categories c ON c.id = p.category_id
  LEFT JOIN posts sp ON sp.id = p.shared_post_id AND (${sharedAclSql})
  LEFT JOIN users su ON su.id = sp.user_id
`;
}
