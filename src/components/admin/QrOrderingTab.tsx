"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STORE_NAME } from "@/lib/storeInfo";

/**
 * Lets an admin generate a printable/downloadable QR code that opens
 * src/app/order/page.tsx (the customer-facing QR/phone ordering flow,
 * source="QR") — for table tents, a counter sign, anywhere a customer can
 * point their own camera at it.
 *
 * The QR is built entirely client-side (the `qrcode` package works in the
 * browser too, not just server-side like its other use in
 * src/lib/services/codes.ts) — there's nothing here worth a round trip to
 * the server, and it means the URL can be edited and re-generated instantly.
 *
 * WHY THE URL DEFAULTS TO window.location.origin: this page has no reliable
 * way to know the store's real public domain on its own (no such env var
 * exists in this app — see .env.example) — but whatever host the admin is
 * currently viewing this dashboard from IS that domain in the normal case
 * (they're on the live site to manage it). Editable below in case that's
 * ever wrong (e.g. viewing over an internal URL that differs from the
 * public one) or you want a QR that lands on a specific path.
 */
export default function QrOrderingTab() {
  const [url, setUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Runs once on mount, client-side only — window isn't available during
  // server rendering, and defaulting to some placeholder first would just
  // flash the wrong URL before this correction landed anyway.
  useEffect(() => {
    setUrl(`${window.location.origin}/order`);
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, scale: 10 })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate a QR code for that URL.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");

  function handlePrint() {
    if (!qrDataUrl) return;
    const win = window.open("", "_blank", "width=500,height=650");
    if (!win) return;
    win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Scan to order — ${STORE_NAME}</title>
<style>
  @page { margin: 0.5in; }
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
    gap: 20px;
  }
  h1 { font-size: 28px; margin: 0; }
  p.sub { font-size: 16px; color: #555; margin: 0 0 8px; }
  img { width: 320px; height: 320px; }
  p.url { font-size: 12px; color: #888; word-break: break-all; max-width: 320px; margin: 0; }
</style>
</head>
<body>
  <div>
    <h1>${STORE_NAME}</h1>
    <p class="sub">Scan to order from your phone</p>
  </div>
  <img src="${qrDataUrl}" alt="QR code to order" />
  <p class="url">${url}</p>
</body>
</html>`);
    win.document.close();
    win.focus();
    // Give the image a moment to paint before the print dialog opens —
    // it's a data: URI (already fully in memory), but a same-tick print()
    // call can still race the initial layout/paint on some browsers.
    setTimeout(() => win.print(), 300);
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-charcoal-900/60">Order page URL</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-domain.com/order" />
          <p className="mt-1 text-xs text-charcoal-900/50">
            Defaults to this page&apos;s own address + <code>/order</code>. Edit it if that&apos;s not
            the address customers will actually reach on their phones (e.g. your real domain once
            deployed to Vercel).
          </p>
          {isLocalhost && (
            <p className="mt-1 text-xs font-semibold text-achuete-600">
              This is a localhost URL — a customer&apos;s phone can&apos;t reach it. Fine for testing
              on this computer, but swap in your real domain before printing for customers.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-border bg-rice-50 p-6">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code to order" className="h-56 w-56" />
          ) : (
            <p className="text-sm opacity-60">Generating…</p>
          )}
          <p className="break-all text-center text-xs text-charcoal-900/50">{url}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handlePrint} disabled={!qrDataUrl}>
          Print
        </Button>
        {qrDataUrl && (
          <a
            href={qrDataUrl}
            download="qr-order.png"
            className="text-sm font-semibold text-achuete-600 underline underline-offset-2"
          >
            Download PNG
          </a>
        )}
      </div>
    </div>
  );
}
