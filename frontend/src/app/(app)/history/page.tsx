import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/ComingSoon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("history")} – Tollvakt` };
}

// Built in the next steps
export default async function HistoryPage() {
  const t = await getTranslations("app.nav");
  return <ComingSoon title={t("history")} />;
}
