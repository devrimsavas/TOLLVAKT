import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Heading, Paragraph } from "@digdir/designsystemet-react";
import { ClassifyForm } from "@/components/classify/ClassifyForm";
import { getUsage } from "@/lib/usage";
import styles from "@/components/classify/classify.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("classify");
  return { title: `${t("title")} – Tollvakt` };
}

export default async function ClassifyPage() {
  const t = await getTranslations("classify");
  const usage = await getUsage();

  return (
    <div className={`container ${styles.page}`}>
      <header>
        <Heading level={1} data-size="lg">
          {t("title")}
        </Heading>
        <Paragraph>{t("lead")}</Paragraph>
      </header>
      <ClassifyForm initialUsage={usage} />
    </div>
  );
}
