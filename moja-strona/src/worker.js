import { EmailMessage } from "cloudflare:email";

// Worker obsługuje tylko POST /api/contact; resztę serwują statyczne pliki z ./public.
const MAX = { name: 100, email: 200, message: 5000 };
const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const b64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const wrap76 = (s) => s.replace(/(.{76})/g, "$1\r\n");
const clean = (s) => String(s ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").trim();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/contact") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);

    // Żądanie musi pochodzić z tej samej witryny
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== url.host) return json({ ok: false, error: "origin" }, 403);

    let data;
    try { data = await request.json(); } catch { return json({ ok: false, error: "invalid" }, 400); }

    // Pole-pułapka dla botów: człowiek go nie widzi i nie wypełni
    if (data.website) return json({ ok: true });

    const name = clean(data.name).slice(0, MAX.name);
    const email = clean(data.email).slice(0, MAX.email);
    const message = String(data.message ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX.message);
    if (!name || !EMAIL_RE.test(email) || message.length < 5) return json({ ok: false, error: "invalid" }, 400);

    const body = `Od: ${name} <${email}>\n\n${message}\n`;
    const raw = [
      `From: Formularz strony <${env.FROM_ADDRESS}>`,
      `To: ${env.TO_ADDRESS}`,
      `Reply-To: ${email}`,
      `Subject: =?UTF-8?B?${b64("Wiadomość ze strony od " + name)}?=`,
      `Message-ID: <${crypto.randomUUID()}@${url.host}>`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(b64(body)),
    ].join("\r\n");

    try {
      await env.CONTACT_EMAIL.send(new EmailMessage(env.FROM_ADDRESS, env.TO_ADDRESS, raw));
    } catch (e) {
      console.error("send failed", e && e.message);
      return json({ ok: false, error: "send" }, 502);
    }
    return json({ ok: true });
  },
};
