export type PageView = "entries" | "markdown";

export function parseRouteHash(): { view: PageView; slug: string } {
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (raw === "markdown" || raw.startsWith("markdown/")) {
    const slug =
      raw === "markdown"
        ? ""
        : decodeURIComponent(raw.slice("markdown/".length));
    return { view: "markdown", slug };
  }
  return { view: "entries", slug: "" };
}

export function setRouteHash(view: PageView, slug?: string) {
  if (view === "markdown") {
    const next = slug ? `markdown/${encodeURIComponent(slug)}` : "markdown";
    if (window.location.hash.replace(/^#/, "") !== next) {
      window.location.hash = next;
    }
    return;
  }
  if (window.location.hash) {
    window.location.hash = "";
  }
}
