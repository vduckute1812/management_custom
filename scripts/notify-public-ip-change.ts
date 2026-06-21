/**
 * Send an email when the router's public IP changes.
 *
 *   node --env-file=docker/.env.prod --import tsx scripts/notify-public-ip-change.ts OLD_IP NEW_IP [LAN_IP]
 */
import { sendPublicIpChangeEmail } from "../server/utils/mailer";

function notifyTo(): string {
  const explicit = process.env.IP_CHANGE_NOTIFY_EMAIL?.trim();
  if (explicit) return explicit;
  const from = process.env.SMTP_FROM?.trim();
  if (from) return from;
  const user = process.env.SMTP_USER?.trim();
  if (user) return user;
  throw new Error("Set IP_CHANGE_NOTIFY_EMAIL or SMTP_USER in docker/.env.prod");
}

const [oldIp, newIp, lanIp = "192.168.1.4"] = process.argv.slice(2);
if (!oldIp || !newIp) {
  console.error("Usage: notify-public-ip-change.ts OLD_IP NEW_IP [LAN_IP]");
  process.exit(2);
}

await sendPublicIpChangeEmail({
  to: notifyTo(),
  oldIp,
  newIp,
  lanIp,
});

console.log(`[notify] public IP change email sent to ${notifyTo()}`);
