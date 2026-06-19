import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },
  // SPA mode. This is a single-user, local-first app whose auth tokens live in
  // localStorage and whose data is per-user. SSR can't read localStorage, so
  // protected pages would either flash /login on every cold load or render an
  // empty shell while server-side API calls 401. Turning SSR off lets the
  // auth plugin populate state once, then the route middleware decides
  // cleanly between rendering the page or redirecting.
  //
  // Implemented via per-route `routeRules` rather than top-level `ssr: false`
  // because Nuxt 3.21.8 has a regression where the top-level toggle trips
  // `resolveServerEntry` ("No entry found in rollupOptions.input").
  routeRules: {
    "/**": { ssr: false },
  },
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: "Personal Task & Analytics Manager",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content:
            "Local-first task and analytics manager built with Nuxt 3.",
        },
        // Render with a sensible color scheme even on first paint, before the
        // theme plugin has run.
        { name: "color-scheme", content: "light dark" },
      ],
      link: [
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "apple-touch-icon", href: "/favicon.png" },
      ],
      script: [
        {
          // Runs synchronously in <head> before any styles paint, so users
          // who chose dark (or set their OS to dark) never see a light flash
          // during hydration. Safe to inline: reads localStorage + media query.
          innerHTML: `(function(){try{var s=localStorage.getItem('mgmt:settings:v1');var t='system';if(s){var p=JSON.parse(s);if(p&&(p.theme==='light'||p.theme==='dark'))t=p.theme;}if(t==='system'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          tagPosition: "head",
        },
      ],
    },
  },
});
