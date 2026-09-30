"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/admin/PageHeader";
import MenuItemForm from "@/components/admin/MenuItemForm";
import type { AdminCategory } from "@/types/models";

export default function NewMenuItemPage() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/categories?type=PRODUCT")
      .then((res) => res.json())
      .then(setCategories);
  }, []);

  return (
    <>
      <PageHeader title="New Menu Item" description="Add a new item to the menu." />
      {categories && <MenuItemForm categories={categories} />}
    </>
  );
}
