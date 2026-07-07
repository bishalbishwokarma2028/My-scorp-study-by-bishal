import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    // If this crash is caused by a stale JS chunk (e.g. right after a new
    // deploy), auto-recover with a hard reload instead of showing the
    // "This page didn't load" screen.
    if (/failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(error.message || "")) {
      const last = Number(sessionStorage.getItem("scorpstudy_chunk_reload_at") || 0);
      const now = Date.now();
      if (now - last >= 10_000) {
        sessionStorage.setItem("scorpstudy_chunk_reload_at", String(now));
        window.location.reload();
      }
    }
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >Try again</button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Go home</a>
        </div>
      </div>
    </div>
  );
}

const SITE_URL = "https://scorpstudy.in.net";
const SITE_NAME = "ScorpStudy by Bishal";
const SITE_TITLE = "ScorpStudy by Bishal – Free AI Student Learning Platform";
const SITE_DESCRIPTION = "ScorpStudy by Bishal is a free AI-powered learning platform for students. Get instant study help, auto-generate quizzes, create smart notes, solve PDFs, make flashcards, build mind maps, and ace every exam with personalized AI tutoring.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "keywords", content: "ScorpStudy, ScorpStudy by Bishal, Bishal's Assistant, AI study tutor, AI learning platform, online study help, quiz generator, flashcard maker, smart notes, PDF summarizer, mind maps, exam preparation, free study app, Bishal Bishwokarma, student learning, study smarter" },
      { name: "author", content: "Bishal Bishwokarma" },
      { name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" },
      { name: "googlebot", content: "index, follow" },
      { name: "theme-color", content: "#7c3aed" },
      { name: "application-name", content: SITE_NAME },
      { name: "generator", content: "ScorpStudy" },
      { name: "google-site-verification", content: "PJqLFpQz3gwF6tTRq91WUt9sx7AETq40SboDOdWtnoU" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:alt", content: "ScorpStudy by Bishal – Free AI Student Learning Platform" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "ScorpStudy by Bishal – Free AI Student Learning Platform" },
      { name: "twitter:creator", content: "@BishalStudy" },
      { name: "twitter:site", content: "@BishalStudy" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "canonical", href: SITE_URL },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      "name": SITE_NAME,
      "alternateName": ["ScorpStudy", "Bishal's Assistant", "ScorpStudy AI"],
      "url": SITE_URL,
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${SITE_URL}/dashboard/chat?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      "name": SITE_NAME,
      "url": SITE_URL,
      "logo": {
        "@type": "ImageObject",
        "url": `${SITE_URL}/icon-512.png`,
        "width": 512,
        "height": 512,
      },
      "image": OG_IMAGE,
      "founder": {
        "@type": "Person",
        "name": "Bishal Bishwokarma",
        "url": "https://www.bishalbishwokarma.in.net",
      },
      "description": SITE_DESCRIPTION,
      "sameAs": ["https://www.bishalbishwokarma.in.net"],
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      "name": SITE_NAME,
      "url": SITE_URL,
      "applicationCategory": "EducationalApplication",
      "operatingSystem": "Web",
      "inLanguage": "en",
      "isAccessibleForFree": true,
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "description": SITE_DESCRIPTION,
      "image": OG_IMAGE,
      "author": { "@type": "Person", "name": "Bishal Bishwokarma" },
    },
  ],
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON_LD }}
          suppressHydrationWarning
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const CHUNK_ERROR_RE = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to fetch/i;
const RELOAD_GUARD_KEY = "scorpstudy_chunk_reload_at";

function forceReloadOnStaleChunk() {
  if (typeof window === "undefined") return;
  // Avoid infinite reload loops — only auto-reload once per 10s window.
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
  const now = Date.now();
  if (now - last < 10_000) return;
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  window.location.reload();
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  // Recover from stale JS chunk references after a new deploy (common on
  // mobile browsers that keep old tabs open across releases). Vite fires
  // "vite:preloadError" for this; we also catch the generic error/rejection
  // path as a fallback for browsers/routers that surface it differently.
  useEffect(() => {
    function onPreloadError(event: Event) {
      event.preventDefault?.();
      forceReloadOnStaleChunk();
    }
    function onError(event: ErrorEvent) {
      if (CHUNK_ERROR_RE.test(event.message || "")) forceReloadOnStaleChunk();
    }
    function onRejection(event: PromiseRejectionEvent) {
      const msg = event.reason?.message || String(event.reason || "");
      if (CHUNK_ERROR_RE.test(msg)) forceReloadOnStaleChunk();
    }
    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
