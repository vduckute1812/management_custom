import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },
  modules: ["@nuxtjs/i18n", "@nuxtjs/seo"],
  // Public-facing identity used by @nuxtjs/seo for canonical URLs, sitemap,
  // robots, Open Graph, and schema.org output.
  site: {
    url: "https://dntechx.com",
    name: "Da Nang TechX",
    description:
      "Da Nang Tech R&D and Networking Portal — feed and time management.",
    defaultLocale: "en",
  },
  // Only the public hub and feed should be indexed; app/admin surfaces are
  // gated SPA views with no crawlable value, so keep them out of search.
  robots: {
    disallow: [
      "/tasks",
      "/epics",
      "/analytics",
      "/admin",
      "/settings",
      "/profile",
      "/login",
      "/signup",
      "/verify-email",
      "/feed/write",
    ],
  },
  // Dynamic OG image rendering needs a native renderer (@takumi-rs/core) that
  // isn't viable on this ARM host. Disable it — OG/Twitter text meta still work
  // via nuxt-seo-utils; use a static og:image if a preview thumbnail is needed.
  ogImage: { enabled: false },
  sitemap: {
    exclude: [
      "/tasks/**",
      "/epics/**",
      "/analytics",
      "/admin/**",
      "/settings",
      "/profile/**",
      "/login",
      "/signup",
      "/verify-email",
    ],
  },
  // SPA mode. Auth tokens live in localStorage; SSR can't read them, so we
  // disable SSR via routeRules. Public routes (/, /feed) render for guests;
  // the auth plugin hydrates once, then route middleware gates protected
  // sections (tasks, settings, admin) without bouncing home to /login.
  //
  // Implemented via per-route `routeRules` rather than top-level `ssr: false`
  // because Nuxt 3.21.8 has a regression where the top-level toggle trips
  // `resolveServerEntry` ("No entry found in rollupOptions.input").
  routeRules: {
    "/**": { ssr: false },
  },
  // After a deploy, hashed /_nuxt/* chunks disappear. SPA clients still on an
  // old shell then fail dynamic imports (Nuxt error page: 500 + a dep index
  // like "26"). Reload immediately instead of only on the next navigation.
  experimental: {
    emitRouteChunkError: "automatic-immediate",
  },
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    strategy: "no_prefix",
    defaultLocale: "en",
    locales: [
      { code: "en", language: "en-US", name: "English", file: "en.json" },
      { code: "vi", language: "vi-VN", name: "Tiếng Việt", file: "vi.json" },
      {
        code: "zh-CN",
        language: "zh-CN",
        name: "简体中文",
        file: "zh-CN.json",
      },
      {
        code: "zh-TW",
        language: "zh-TW",
        name: "繁體中文",
        file: "zh-TW.json",
      },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "mgmt_locale",
      fallbackLocale: "en",
      alwaysRedirect: false,
    },
  },
  app: {
    head: {
      title: "Da Nang Tech R&D and Networking Portal",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content: "Local-first task and analytics manager built with Nuxt 3.",
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
