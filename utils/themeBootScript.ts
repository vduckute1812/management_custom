/**
 * Pre-hydration theme boot — inlined in `nuxt.config` `<head>` so dark-mode
 * users never flash light during hydration. Reads localStorage +
 * prefers-color-scheme only. Document CSP stamps a per-request nonce onto
 * this `<script>` via `server/plugins/csp-nonce.ts`.
 */
export const THEME_BOOT_SCRIPT =
  "(function(){try{var s=localStorage.getItem('mgmt:settings:v1');var t='system';if(s){var p=JSON.parse(s);if(p&&(p.theme==='light'||p.theme==='dark'))t=p.theme;}if(t==='system'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();";
