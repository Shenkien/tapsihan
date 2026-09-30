import Image from "next/image";

export default function OrderCodeDisplay({ image, orderNo }: { image: string | null; orderNo: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-white p-5 shadow-brand">
      {image ? (
        // Code39 barcodes are wide/short, not square — let it size by its
        // own aspect ratio instead of forcing a fixed square like a QR code.
        <Image
          src={image}
          alt={`Order barcode for order ${orderNo}`}
          width={280}
          height={90}
          unoptimized
          style={{ width: "100%", maxWidth: 280, height: "auto" }}
        />
      ) : (
        <div className="h-20" />
      )}
      <p className="font-bold tracking-wide">ORDER #{orderNo}</p>
    </div>
  );
}
