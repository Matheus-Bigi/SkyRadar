import { NextRequest, NextResponse } from "next/server";
import { probeAircraftPhoto } from "@/lib/aircraft/photo";

export const dynamic = "force-dynamic";

/**
 * Why is this aircraft's card missing a photo?
 *
 * The lookup fails silently by design — a card showing nothing is the right
 * outcome when no photo exists — which makes "nothing on file" and "upstream
 * refused us" look identical from a device. This tells them apart: every
 * source's HTTP status and a raw response excerpt. It bypasses every cache,
 * so it reports what those services are doing right now.
 *
 * Opened in a browser it renders a page with a form, because the usual way
 * this gets used is somebody on an iPad trying to find out why a card is
 * blank — and a bare JSON body with no parameters, which Safari offers to
 * download rather than display, helps nobody.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hex = searchParams.get("hex")?.trim() || undefined;
  const registration = searchParams.get("registration")?.trim() || undefined;

  const wantsHtml =
    searchParams.get("format") !== "json" &&
    (req.headers.get("accept") ?? "").includes("text/html");

  if (!hex && !registration) {
    return wantsHtml
      ? html(page(null, hex, registration))
      : NextResponse.json({ error: "pass ?hex= and/or ?registration=" }, { status: 400 });
  }

  const photo = await probeAircraftPhoto({ icao24: hex, registration });
  const body = {
    checkedAt: new Date().toISOString(),
    photo,
    notes: [
      "Sources are tried in tiers: Planespotters (hex and registration at once),",
      "then airport-data.com. A 200 with an empty photo list is a genuine absence;",
      "anything else — a non-200, a non-JSON body, a populated response read as",
      "empty — is a bug or a block worth reporting.",
    ].join(" "),
  };

  return wantsHtml ? html(page(body, hex, registration)) : NextResponse.json(body, nostore);
}

const nostore = { headers: { "Cache-Control": "no-store" } };

function html(markup: string) {
  return new NextResponse(markup, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function esc(v: unknown): string {
  return String(v).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}

interface ProbeAttempt {
  source: string;
  url: string;
  elapsedMs: number;
  ok: boolean;
  httpStatus?: number;
  foundPhoto?: boolean;
  imageUrl?: string | null;
  responseExcerpt?: string;
  error?: string;
}

function page(
  body: { photo: { attempts: ProbeAttempt[] } } | null,
  hex?: string,
  registration?: string
): string {
  const rows = (body?.photo.attempts ?? [])
    .map((a) => {
      const verdict = !a.ok
        ? `<span class="bad">FAILED</span> ${esc(a.error ?? "")}`
        : a.foundPhoto
          ? `<span class="good">FOUND</span> ${esc(a.imageUrl ?? "")}`
          : `<span class="warn">NO PHOTO</span> (HTTP ${esc(a.httpStatus ?? "?")})`;
      return `<tr>
        <td>${esc(a.source)}</td>
        <td>${esc(a.elapsedMs)}ms</td>
        <td>${verdict}</td>
      </tr>
      <tr class="detail"><td colspan="3"><code>${esc(a.responseExcerpt ?? "—")}</code></td></tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SkyRadar photo diagnostics</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:16px; background:#05080a; color:#d7e6e1;
         font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  h1 { font-size:15px; letter-spacing:.14em; text-transform:uppercase; color:#33ff99; margin:0 0 4px; }
  p.sub { color:#7d938c; font-size:12px; margin:0 0 16px; }
  form { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
  input { flex:1 1 150px; min-width:0; padding:10px; border-radius:8px; background:#0a1210;
          border:1px solid #1c2b26; color:#d7e6e1; font-family:ui-monospace,monospace; font-size:16px; }
  button { padding:10px 18px; border-radius:8px; border:0; background:#33ff99; color:#000;
           font-weight:600; letter-spacing:.1em; font-size:13px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:8px 6px; border-bottom:1px solid #1c2b26; vertical-align:top;
       font-family:ui-monospace,monospace; font-size:12px; }
  tr.detail td { border-bottom:1px solid #1c2b26; color:#7d938c; }
  code { display:block; overflow-x:auto; white-space:pre-wrap; word-break:break-all; font-size:11px; }
  .good { color:#33ff99; } .warn { color:#e0a840; } .bad { color:#ff6b6b; }
  .note { color:#7d938c; font-size:12px; line-height:1.5; margin-top:20px; }
</style></head><body>
<h1>Photo diagnostics</h1>
<p class="sub">What each photo service says about one airframe, right now, with every cache bypassed.</p>
<form method="get">
  <input name="hex" placeholder="ICAO hex (e.g. a2d0f4)" value="${esc(hex ?? "")}" autocapitalize="off" autocorrect="off">
  <input name="registration" placeholder="Registration (e.g. N487AS)" value="${esc(registration ?? "")}" autocapitalize="characters" autocorrect="off">
  <button type="submit">Check</button>
</form>
${body ? `<table>${rows}</table>` : `<p class="note">Enter an aircraft's hex and/or registration above. Both are shown on its card in the app.</p>`}
<p class="note">Sources are tried in tiers: Planespotters (hex and registration together), then airport-data.com.
A <b>200 with an empty list</b> means that airframe genuinely has no photo on file.
Anything else — a non-200, an HTML body, a populated response read as empty — is a bug or a block worth sending on.</p>
</body></html>`;
}
