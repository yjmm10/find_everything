declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    umami?: { track: (payload?: string | Record<string, unknown>) => void };
    goatcounter?: { count: (args: { path?: string; title?: string; event?: boolean }) => void };
  }
}

let gaMeasurementId = "";
let umamiReady = false;
let goatcounterEndpoint = "";

/** 虚拟路径：含 BASE、查询串与 hash，便于 SPA 区分页面 */
export function analyticsPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash || "#entries"}`;
}

function appendScript(src: string, attrs?: Record<string, string>): void {
  if ([...document.scripts].some((el) => el.src === src)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      script.setAttribute(key, value);
    }
  }
  document.head.appendChild(script);
}

function initGa4(id: string): void {
  gaMeasurementId = id;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  window.gtag("config", id, { send_page_view: false });
}

function initUmami(websiteId: string, scriptUrl: string): void {
  appendScript(scriptUrl, { "data-website-id": websiteId });
  umamiReady = true;
}

function initGoatCounter(endpoint: string): void {
  const base = endpoint.replace(/\/count\/?$/, "");
  goatcounterEndpoint = `${base}/count`;
  if (document.querySelector("script[data-goatcounter]")) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = "//gc.zgo.at/count.js";
  script.dataset.goatcounter = goatcounterEndpoint;
  document.head.appendChild(script);
}

/** 构建时注入；未配置任一 ID 时不加载脚本 */
export function initAnalytics(): void {
  const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  const umamiId = import.meta.env.VITE_UMAMI_WEBSITE_ID?.trim();
  const umamiScript =
    import.meta.env.VITE_UMAMI_SCRIPT_URL?.trim() || "https://cloud.umami.is/script.js";
  const goatEndpoint = import.meta.env.VITE_GOATCOUNTER_ENDPOINT?.trim();

  if (gaId) initGa4(gaId);
  if (umamiId) initUmami(umamiId, umamiScript);
  if (goatEndpoint) initGoatCounter(goatEndpoint);
}

export function isAnalyticsEnabled(): boolean {
  return Boolean(gaMeasurementId || umamiReady || goatcounterEndpoint);
}

/** 上报 SPA 页面浏览；可重复调用（切换 Tab / hash 时） */
export function trackPageView(path = analyticsPath()): void {
  if (gaMeasurementId && window.gtag) {
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }

  if (umamiReady && window.umami) {
    window.umami.track();
  }

  if (goatcounterEndpoint && window.goatcounter?.count) {
    window.goatcounter.count({ path, title: document.title });
  }
}
