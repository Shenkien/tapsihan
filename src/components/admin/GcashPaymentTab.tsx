"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PhotoUploadField from "@/components/admin/PhotoUploadField";
import { useToast } from "@/hooks/use-toast";

type GcashSettings = {
  qrImageUrl: string | null;
  accountName: string | null;
  accountNumber: string | null;
};

export default function GcashPaymentTab() {
  const [settings, setSettings] = useState<GcashSettings | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/settings/gcash");
    if (!res.ok) return;
    const data: GcashSettings = await res.json();
    setSettings(data);
    setQrImageUrl(data.qrImageUrl);
    setAccountName(data.accountName ?? "");
    setAccountNumber(data.accountNumber ?? "");
  }

  useEffect(() => {
    load();
  }, []);

  // Whether the form has actually changed from what's saved — used to warn
  // before navigating away with an uploaded-but-unsaved QR image.
  const dirty =
    settings !== null &&
    (qrImageUrl !== (settings.qrImageUrl ?? null) ||
      accountName !== (settings.accountName ?? "") ||
      accountNumber !== (settings.accountNumber ?? ""));

  async function handleSave() {
    if (!qrImageUrl) {
      toast({ title: "Upload a QR code image first", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/settings/gcash", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrImageUrl,
        accountName: accountName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Could not save", description: data.error, variant: "destructive" });
      return;
    }
    setSettings(data);
    toast({ description: "Saved — the checkout screen will show this QR right away." });
  }

  if (!settings) return <p className="opacity-60">Loading…</p>;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm text-charcoal-900/60">
          This is your store&apos;s own GCash QR — the same one under{" "}
          <strong>Receive Money via QR Code → My Personal QR</strong> in the GCash app. Take a
          screenshot or download it there, then upload it here.
        </p>

        <PhotoUploadField label="QR Code" folder="settings" imageUrl={qrImageUrl} onChange={setQrImageUrl} required />

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-charcoal-900/60">
              Account name shown to customers (optional)
            </label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Luis Reginaldo M."
              maxLength={100}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-charcoal-900/60">
              Account number shown to customers (optional)
            </label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 09***1373"
              maxLength={30}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {!dirty && <span className="text-xs font-semibold text-charcoal-900/50">Change something to enable Save</span>}
        {dirty && (
          <span className="rounded-full bg-turmeric-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-achuete-700">
            Unsaved changes
          </span>
        )}
      </div>
    </div>
  );
}
