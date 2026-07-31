import { installLogBuffer } from "~/server/utils/logBuffer";

/**
 * Capture recent console output for the superadmin system monitor.
 * Must run early so boot / migrate lines are retained when possible.
 */
export default defineNitroPlugin(() => {
  installLogBuffer();
});
