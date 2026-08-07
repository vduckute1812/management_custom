-- One-shot: create a least-privilege MySQL user for the Nitro app process.
-- Run as root against an existing volume (first-boot MYSQL_USER only applies
-- to empty data dirs). Example on the Pi:
--
--   podman exec -i mgmt-mysql-prod \
--     env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
--     mysql -uroot < docker/mysql-create-app-user.sql
--
-- Then in docker/.env.prod set:
--   DB_USER=mgmt
--   DB_PASS=<same password as below>
-- and remove ALLOW_ROOT_DB if it was set.
--
-- Keep MYSQL_ROOT_PASSWORD for migrate/admin one-shots; the app should not
-- use root. Replace CHANGE_ME before running.

CREATE USER IF NOT EXISTS 'mgmt'@'%' IDENTIFIED BY 'CHANGE_ME';

-- Runtime DML only. Schema changes go through `npm run migrate` / the
-- migrate container as root (or another privileged admin account).
GRANT SELECT, INSERT, UPDATE, DELETE ON `rc`.* TO 'mgmt'@'%';

FLUSH PRIVILEGES;
