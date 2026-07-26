-- Seed the four core tech topics for the resource-sharing hub.
-- Low sort_order values place them ahead of the earlier generic seeds.

INSERT INTO post_categories (id, slug, name, sort_order, created_at) VALUES
  ('cat_electronics', 'electronics', 'Electronics', 1, UTC_TIMESTAMP(3)),
  ('cat_mechanical', 'mechanical-engineering', 'Mechanical Engineering', 2, UTC_TIMESTAMP(3)),
  ('cat_it', 'information-technology', 'Information Technology (IT)', 3, UTC_TIMESTAMP(3)),
  ('cat_iot', 'iot', 'IoT (Internet of Things)', 4, UTC_TIMESTAMP(3));
