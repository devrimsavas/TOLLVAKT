import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/ComingSoon";
import { requireUser } from "@/lib/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("admin")} – Tollvakt` };
}

// Admins only: for anyone else the page does not exist. The API checks
// the role on every admin call too.
export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  const t = await getTranslations("app.nav");
  return <ComingSoon title={t("admin")} />;
}
