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
const SITE_TITLE = "ScorpStudy by Bishal – AI Student Learning Platform 🚀";
const SITE_DESCRIPTION = "ScorpStudy by Bishal is an AI-powered learning platform for students. Get study help, notes, quizzes, mock tests and personalized AI tutoring. Study Smart. Learn Faster. Achieve More.";

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
      { property: "og:image", content: `${SITE_URL}/favicon.png` },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:alt", content: "ScorpStudy by Bishal – AI Student Learning Platform" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/favicon.png` },
      { name: "twitter:image:alt", content: "ScorpStudy by Bishal – AI Student Learning Platform" },
      { name: "twitter:creator", content: "@BishalStudy" },
      { name: "twitter:site", content: "@BishalStudy" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
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

const JSON_LD = JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
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
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": SITE_NAME,
    "url": SITE_URL,
    "logo": {
      "@type": "ImageObject",
      "url": `${SITE_URL}/favicon.png`,
      "width": 512,
      "height": 512,
    },
    "founder": {
      "@type": "Person",
      "name": "Bishal Bishwokarma",
      "url": "https://www.bishalbishwokarma.in.net",
    },
    "description": SITE_DESCRIPTION,
    "sameAs": ["https://www.bishalbishwokarma.in.net"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": SITE_NAME,
    "url": SITE_URL,
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web",
    "inLanguage": "en",
    "isAccessibleForFree": true,
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "description": SITE_DESCRIPTION,
    "image": `${SITE_URL}/favicon.png`,
    "author": { "@type": "Person", "name": "Bishal Bishwokarma" },
    "featureList": [
      "Bishal's Assistant – 24/7 AI Study Help",
      "Study Notes – Chapter-wise Notes",
      "Quizzes & Tests – Practice & Improve",
      "PDF to Notes – Smart AI Tool",
      "Track Progress – Streaks & Badges",
      "Flashcard Maker – Spaced Repetition",
      "Mind Maps – Visual Learning",
      "Universal Translator – Any Language",
      "Image Question Solver",
      "Smart Calculator",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "ScorpStudy Features",
    "url": SITE_URL,
    "itemListElement": [
      { "@type": "SiteLinksAction", "name": "Bishal's Assistant", "url": `${SITE_URL}/dashboard/chat`, "position": 1 },
      { "@type": "SiteLinksAction", "name": "Study Notes", "url": `${SITE_URL}/dashboard/notes`, "position": 2 },
      { "@type": "SiteLinksAction", "name": "Quizzes & Tests", "url": `${SITE_URL}/dashboard/quiz`, "position": 3 },
      { "@type": "SiteLinksAction", "name": "Flashcards", "url": `${SITE_URL}/dashboard/flashcards`, "position": 4 },
      { "@type": "SiteLinksAction", "name": "Login", "url": `${SITE_URL}/auth`, "position": 5 },
    ],
  },
]);

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
