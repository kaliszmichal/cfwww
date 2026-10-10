// Worker do dwóch rzeczy:
// 1. Serwuje statyczne pliki strony (public/) tak jak wcześniej robiły to Workers Assets.
// 2. Obsługuje GET /api/visits — zlicza odwiedziny w Cloudflare KV i zwraca aktualną liczbę.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/visits") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const current = parseInt((await env.VISITS.get("count")) ?? "0", 10) || 0;
      const next = current + 1;
      // zapis w tle, żeby odpowiedź nie czekała na KV
      ctx.waitUntil(env.VISITS.put("count", String(next)));
      return new Response(JSON.stringify({ count: next }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
