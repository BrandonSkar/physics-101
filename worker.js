// Physics 101 on Cloudflare: the course at https://brandonskar.com/physics/.
// Mochi Garden's Worker answers the rest of brandonskar.com; this Worker only
// gets /physics (see the route in wrangler.jsonc). Deploy with npm run deploy.

const SITE = "brandonskar.com";
const BASE = "/physics";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Plain http goes to https, except under npm run dev (which sets LOCAL and serves plain http).
    const local = !!env.LOCAL;
    if (url.protocol === "http:" && !local) {
      return new Response(null, { status: 301, headers: { Location: "https://" + SITE + url.pathname + url.search } });
    }
    const res = await route(request, env, url);
    if (!local) res.headers.set("Strict-Transport-Security", "max-age=31536000");
    return res;
  },
};

async function route(request, env, url) {
  if (url.hostname === "www." + SITE && !env.LOCAL) {
    return new Response(null, { status: 301, headers: { Location: "https://" + SITE + url.pathname + url.search } });
  }
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch (e) {
    return text(400, "Bad address");
  }
  if (p !== BASE && !p.startsWith(BASE + "/")) return text(404, "Not found");
  p = p.slice(BASE.length);
  // The course's address is /physics/ (the slash keeps its files' relative paths working).
  if (p === "") return new Response(null, { status: 301, headers: { Location: BASE + "/" + url.search } });
  if (request.method !== "GET" && request.method !== "HEAD") return text(405, "Not allowed");
  return file(request, env, p === "/" ? "/index.html" : p);
}

function text(status, body) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// A file from site/physics. The page only loads its own files and Google Fonts.
async function file(request, env, p) {
  const res = await env.ASSETS.fetch(new Request(new URL(BASE + p, request.url), { method: request.method }));
  if (!res.ok) return text(404, "Not found");
  const headers = new Headers(res.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
  // Always check for a newer version, so a new deploy shows up on reload.
  headers.set("Cache-Control", "no-cache");
  return new Response(res.body, { status: res.status, headers });
}
