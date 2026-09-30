import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/pusher";
import { HttpError, readJson, toErrorResponse } from "@/lib/api-helpers";
import { clientIp } from "@/lib/auth-throttle";
import { rateLimited } from "@/lib/rate-limit";
import { cancelOrder } from "@/lib/services/orderCancel";
import { cancelTokenMatches } from "@/lib/orderCancelToken";
import { customerCancelSchema } from "@/lib/validations";

// POST /api/orders/:orderNo/cancel  { token }
// Lets the customer who placed an order cancel it while it is still unpaid.
// `token` is the secret returned once by POST /api/orders. Once staff have
// confirmed payment this refuses (409): a paid order is cancelled by staff,
// who also handle the refund. Every failure to prove ownership gets the same
// answer, so it can't be used to find out which orders exist.
const NOT_ALLOWED = "This order can't be cancelled from here. Please ask the counter.";

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const parsed = customerCancelSchema.safeParse({ orderNo, ...(((await readJson(req)) as object | null) ?? {}) });
  if (!parsed.success) return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });

  if (
    await rateLimited({
      kind: "CANCEL",
      subject: parsed.data.orderNo,
      ip: clientIp(req.headers),
      windowMs: 10 * 60 * 1000,
      perSubject: 10,
      perIp: 30,
    })
  ) {
    return NextResponse.json({ error: "Too many tries. Please ask the counter." }, { status: 429 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { orderNo: parsed.data.orderNo },
      select: { id: true, cancelTokenHash: true },
    });
    if (!order || !cancelTokenMatches(parsed.data.token, order.cancelTokenHash)) {
      return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });
    }

    // onlyIfStatus: a customer can never cancel an order staff already paid.
    const cancelled = await cancelOrder(order.id, {
      onlyIfStatus: "CREATED",
      actor: { name: "Customer (self-cancel)" },
    }).catch((err) => {
      if (err instanceof HttpError && err.status === 409) {
        throw new HttpError(409, "This order was already paid or closed. Please ask the counter.");
      }
      throw err;
    });

    await Promise.allSettled([notify("staff:queue-updated", {}), notify("menu:updated", {})]);
    return NextResponse.json({ ok: true, status: cancelled.status });
  } catch (err) {
    return toErrorResponse(err);
  }
}
