-- One-shot / reference: least-privilege MySQL user for the Nitro app process.
-- Prefer the scripted cutover (reads passwords from docker/.env.prod):
--
--   bash docker/apply-mysql-app-user.sh
--   bash docker/verify-mysql-app-user.sh
--
-- Manual (as root against an existing volume — first-boot MYSQL_USER only
-- applies to empty data dirs):
--
--   podman exec -i mgmt-mysql-prod \
--     env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
--     mysql -uroot < docker/mysql-create-app-user.sql
--
-- Then in Doppler `prd` / docker/.env.prod set:
--   DB_USER=mgmt
--   DB_PASS=<same password as below>
-- and remove ALLOW_ROOT_DB if it was set.
--
-- Keep MYSQL_ROOT_PASSWORD for migrate/admin one-shots; the app should not
-- use root. Replace CHANGE_ME before running the manual path.
--
-- Host defaults to '%' so the app can connect via ${LAN_IP}:3306 (Podman has
-- no compose service DNS on this Pi). Optional tighter host via
-- MYSQL_APP_USER_HOST when using apply-mysql-app-user.sh (e.g. '192.168.1.%').
-- Do NOT switch compose MySQL/Redis to loopback-only — that breaks the LAN
-- DNS workaround. Restrict exposure with the host firewall instead.

CREATE USER IF NOT EXISTS 'mgmt'@'%' IDENTIFIED BY 'CHANGE_ME';

-- Runtime DML only. Schema changes go through `npm run migrate` / the
-- migrate container as root (or another privileged admin account).
GRANT SELECT, INSERT, UPDATE, DELETE ON `rc`.* TO 'mgmt'@'%';

FLUSH PRIVILEGES;
