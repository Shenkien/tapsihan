import { prisma } from "@/lib/prisma";

const QR_IMAGE_URL_KEY = "gcash.qrImageUrl";
const ACCOUNT_NAME_KEY = "gcash.accountName";
const ACCOUNT_NUMBER_KEY = "gcash.accountNumber";

const GCASH_KEYS = [QR_IMAGE_URL_KEY, ACCOUNT_NAME_KEY, ACCOUNT_NUMBER_KEY];

export type GcashSettings = {
  qrImageUrl: string | null;
  accountName: string | null;
  accountNumber: string | null;
};

/** Reads the currently saved GCash settings. All fields are null until an
 * admin fills in the Maintenance > GCash Payment form for the first time. */
export async function getGcashSettings(): Promise<GcashSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: GCASH_KEYS } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    qrImageUrl: byKey.get(QR_IMAGE_URL_KEY) || null,
    accountName: byKey.get(ACCOUNT_NAME_KEY) || null,
    accountNumber: byKey.get(ACCOUNT_NUMBER_KEY) || null,
  };
}

/** Saves the GCash settings shown to customers at checkout. `qrImageUrl` is
 * required (there's no point saving account name/number without a QR to
 * show); `accountName`/`accountNumber` are optional display-only fields
 * that help a customer confirm they're paying the right account, mirroring
 * what GCash's own "My Personal QR" screen shows. */
export async function setGcashSettings(input: {
  qrImageUrl: string;
  accountName?: string | null;
  accountNumber?: string | null;
}): Promise<GcashSettings> {
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: QR_IMAGE_URL_KEY },
      update: { value: input.qrImageUrl },
      create: { key: QR_IMAGE_URL_KEY, value: input.qrImageUrl },
    }),
    prisma.setting.upsert({
      where: { key: ACCOUNT_NAME_KEY },
      update: { value: input.accountName ?? "" },
      create: { key: ACCOUNT_NAME_KEY, value: input.accountName ?? "" },
    }),
    prisma.setting.upsert({
      where: { key: ACCOUNT_NUMBER_KEY },
      update: { value: input.accountNumber ?? "" },
      create: { key: ACCOUNT_NUMBER_KEY, value: input.accountNumber ?? "" },
    }),
  ]);
  return getGcashSettings();
}
