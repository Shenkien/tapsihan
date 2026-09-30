"use client";

import { useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function PhotoUploadField({
  imageUrl,
  onChange,
  label = "Photo",
  folder = "products",
  required = false,
}: {
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  /** Field label shown above the preview — defaults to "Photo" for the
   * original Products-tab usage. */
  label?: string;
  /** Blob storage subfolder passed to POST /api/upload — keeps uploads from
   * different admin features organized instead of everything landing
   * under products/. Must be one of upload/route.ts's ALLOWED_FOLDERS. */
  folder?: string;
  /** Marks the field with a red * (and a green tick once a photo is set). Photos are optional by default. */
  required?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function handleFile(file: File) {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    body.append("folder", folder);
    let res: Response;
    try {
      res = await fetch("/api/upload", { method: "POST", body });
    } catch {
      setUploading(false);
      toast({ title: "Upload failed", description: "Couldn't reach the server. Check the connection and try again.", variant: "destructive" });
      return;
    }
    setUploading(false);
    if (res.status === 413) {
      toast({ title: "Upload failed", description: "That image is too large. Use one under 4MB.", variant: "destructive" });
      return;
    }
    // A failure here can come back with no body at all (a network drop, a
    // dev-server crash mid-request) — res.json() throws "Unexpected end of
    // JSON input" on that instead of resolving, which used to crash the
    // whole form instead of just showing "Upload failed".
    let data: { url?: string; error?: string } = {};
    try {
      data = await res.json();
    } catch {
      toast({ title: "Upload failed", description: "The server didn't send back a valid response. Please try again.", variant: "destructive" });
      return;
    }
    if (!res.ok) {
      toast({ title: "Upload failed", description: data.error, variant: "destructive" });
      return;
    }
    onChange(data.url as string);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-sm font-semibold">
        {label}
        {required ? (
          imageUrl ? (
            <span className="ml-1 font-extrabold text-emerald-600" aria-hidden>
              ✓
            </span>
          ) : (
            <span className="ml-0.5 font-extrabold text-danger" aria-hidden>
              *
            </span>
          )
        ) : (
          <span className="ml-1 text-xs font-normal text-charcoal-900/40">optional</span>
        )}
      </span>
      <div className="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-xl border border-border bg-rice-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-6 w-6 text-charcoal-900/30" />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}
