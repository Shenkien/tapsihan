import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireRole } from "@/lib/auth";

// POST /api/upload — multipart/form-data with a "file" field and an
// optional "folder" field (defaults to "products" — the original caller,
// the admin Products tab). Other admin features (e.g. the GCash Payment
// settings form) pass their own folder so uploads stay organized in blob
// storage instead of everything landing under products/.
const ALLOWED_FOLDERS = new Set(["products", "settings"]);

function detectImageType(b: Uint8Array): { ext: string; mime: string } | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return { ext: "jpg", mime: "image/jpeg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", mime: "image/png" };
  if (at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return { ext: "gif", mime: "image/gif" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["ADMIN"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A body that isn't valid multipart (or is cut off) makes formData() throw.
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  // Vercel rejects request bodies over ~4.5 MB itself (a non-JSON 413 that
  // the admin page can't explain), so stay safely under that.
  const MAX_BYTES = 4 * 1024 * 1024;
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 4MB or smaller" }, { status: 400 });
  }

  // file.type is whatever the browser (or a script) claims, and SVG passes a
  // plain startsWith("image/") check while being able to carry scripts. Decide
  // the type from the file's own first bytes and only allow raster formats.
  const detected = detectImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!detected) {
    return NextResponse.json({ error: "Only JPG, PNG, WebP or GIF images are allowed" }, { status: 400 });
  }

  const folderInput = form.get("folder");
  const folder = typeof folderInput === "string" && ALLOWED_FOLDERS.has(folderInput) ? folderInput : "products";

  try {
    // The stored name is generated, never taken from the upload, so a crafted
    // file name can't put odd characters or path segments into the blob path.
    const blob = await put(`${folder}/${crypto.randomUUID()}.${detected.ext}`, file, {
      access: "public",
      contentType: detected.mime,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    // put() throws if Vercel Blob isn't configured for this environment
    // (BLOB_READ_WRITE_TOKEN unset/invalid) or the request to blob storage
    // otherwise fails. Uncaught, that's an unhandled 500 with no JSON body
    // — the client's res.json() then throws "Unexpected end of JSON
    // input" and takes the whole admin page down instead of just showing
    // an error. A real error body at least lets the caller show a normal
    // "Upload failed" toast.
    console.error("Image upload failed:", err);
    return NextResponse.json(
      { error: "Image upload isn't available right now — storage isn't configured. Ask an admin to check BLOB_READ_WRITE_TOKEN." },
      { status: 500 }
    );
  }
}
