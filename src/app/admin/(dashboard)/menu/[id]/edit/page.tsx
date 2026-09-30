"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import MenuItemForm from "@/components/admin/MenuItemForm";
import type { AdminProduct, AdminCategory } from "@/types/models";

export default function EditMenuItemPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/products/${id}`).then((res) => res.json()),
      fetch("/api/admin/categories?type=PRODUCT").then((res) => res.json()),
    ]).then(([singleProduct, categoryList]: [AdminProduct, AdminCategory[]]) => {
      setProduct(singleProduct);
      setCategories(categoryList);
    });
  }, [id]);

  return (
    <>
      <PageHeader title="Edit Menu Item" description="Update this item's details, price, and availability." />
      {product && categories && <MenuItemForm categories={categories} initial={product} />}
    </>
  );
}
