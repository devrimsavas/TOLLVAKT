import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AssistantIntro } from "@/components/classify/AssistantIntro";
import { ClassifyForm } from "@/components/classify/ClassifyForm";
import { getUsage } from "@/lib/usage";
import styles from "@/components/classify/classify.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("classify.assistant");
  return { title: `${t("title")} – Tollvakt` };
}

export default async function ClassifyPage() {
  const usage = await getUsage();

  return (
    <div className={`container ${styles.page}`}>
      <AssistantIntro />
      <ClassifyForm initialUsage={usage} />
    </div>
  );
}
