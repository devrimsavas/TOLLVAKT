import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Heading, Paragraph } from "@digdir/designsystemet-react";
import { FeedbackForm } from "@/components/FeedbackForm";
import { toFeedbackKind, toFeedbackPage } from "@/lib/feedback";
import { getCurrentUser } from "@/lib/user";
import styles from "@/components/AuthForms.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("feedback");
  return { title: `${t("title")} – Tollvakt` };
}

// Open to everyone. Links can say what the feedback is about and where the
// user came from: /feedback?kind=problem&from=/classify
export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  const t = await getTranslations("feedback");
  const params = await searchParams;
  const user = await getCurrentUser();

  return (
    <div className={`container ${styles.page}`}>
      <div className={`${styles.card} ${styles.wide}`}>
        <Heading level={1} data-size="md">
          {t("title")}
        </Heading>
        <Paragraph>{t("lead")}</Paragraph>
        <FeedbackForm
          email={user?.email ?? ""}
          kind={params.kind ? toFeedbackKind(params.kind) : "idea"}
          page={toFeedbackPage(params.from)}
        />
      </div>
    </div>
  );
}
