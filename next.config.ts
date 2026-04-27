import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.prod.website-files.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
  async redirects() {
    return [
      // Dashboard root
      { source: "/admin", destination: "/admin-v2", permanent: false },

      // Counterparties were merged into a single finance-scoped page with full
      // dossier (kept HR access). The old HR-only path stays as a permanent
      // redirect so external links/bookmarks survive.
      {
        source: "/admin-v2/hr/counterparties",
        destination: "/admin-v2/counterparties",
        permanent: false,
      },
      {
        source: "/admin-v2/hr/counterparties/:id",
        destination: "/admin-v2/counterparties/:id",
        permanent: false,
      },

      // Projects
      { source: "/admin/projects", destination: "/admin-v2/projects", permanent: false },
      { source: "/admin/projects/new", destination: "/admin-v2/projects/new", permanent: false },
      { source: "/admin/projects/dashboard", destination: "/admin-v2/projects/dashboard", permanent: false },
      { source: "/admin/projects/:id", destination: "/admin-v2/projects/:id", permanent: false },
      { source: "/admin/projects/:id/stages", destination: "/admin-v2/projects/:id/stages", permanent: false },
      { source: "/admin/projects/:id/finances", destination: "/admin-v2/projects/:id/finances", permanent: false },
      { source: "/admin/projects/:id/photos/new", destination: "/admin-v2/projects/:id/photos/new", permanent: false },

      // Clients
      { source: "/admin/clients", destination: "/admin-v2/clients", permanent: false },

      // Estimates — order matters! Specific paths first, dynamic :id last.
      // AI generator legacy URL → v2 prototype (must come before :id catch-all)
      { source: "/admin/estimates/ai-generate", destination: "/ai-estimate-v2", permanent: false },
      { source: "/admin/estimates", destination: "/admin-v2/estimates", permanent: false },
      { source: "/admin/estimates/new", destination: "/admin-v2/estimates/new", permanent: false },
      { source: "/admin/estimates/:id", destination: "/admin-v2/estimates/:id", permanent: false },

      // Materials
      { source: "/admin/materials", destination: "/admin-v2/materials", permanent: false },

      // Resources
      { source: "/admin/resources/equipment", destination: "/admin-v2/resources/equipment", permanent: false },
      { source: "/admin/resources/warehouse", destination: "/admin-v2/resources/warehouse", permanent: false },
      { source: "/admin/resources/workers", destination: "/admin-v2/resources/workers", permanent: false },

      // CMS
      { source: "/admin/cms/portfolio", destination: "/admin-v2/cms/portfolio", permanent: false },
      { source: "/admin/cms/news", destination: "/admin-v2/cms/news", permanent: false },

      // System
      { source: "/admin/users", destination: "/admin-v2/users", permanent: false },
      { source: "/admin/settings", destination: "/admin-v2/settings", permanent: false },

      // Feed
      { source: "/admin/feed", destination: "/admin-v2/feed", permanent: false },

      // Chat
      { source: "/admin/chat", destination: "/admin-v2/chat", permanent: false },
      { source: "/admin/chat/:conversationId", destination: "/admin-v2/chat/:conversationId", permanent: false },

      // Finance
      { source: "/admin/finance", destination: "/admin-v2/finance", permanent: false },
      { source: "/admin/finance/templates", destination: "/admin-v2/finance/templates", permanent: false },
      { source: "/admin/finance/configure/:id", destination: "/admin-v2/finance/configure/:id", permanent: false },

      // NOT redirected (legacy stays as fallback — no v2 equivalent yet):
      // - /admin/migrate              (internal migration tool)
    ];
  },
  async headers() {
    return [
      {
        // Next.js immutable static assets
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Public images, icons, fonts
        source: "/:path*.(ico|svg|png|jpg|jpeg|webp|avif|woff|woff2|ttf|otf)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        // Manifest + service worker — short cache so updates roll out fast
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
