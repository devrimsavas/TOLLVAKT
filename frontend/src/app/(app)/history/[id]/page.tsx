import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Alert, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { ArrowLeftIcon } from "@navikt/aksel-icons";
import { ClassificationResult } from "@/components/classify/ClassificationResult";
import { HistoryActions } from "@/components/history/HistoryActions";
import { getSaved } from "@/lib/history";
import styles from "@/components/history/history.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("history");
  return { title: `${t("one")} – Tollvakt` };
}

// One saved classification, as it was answered, to read again or print
export default async function SavedClassificationPage({
  params,
}: PageProps<"/history/[id]">) {
  const t = await getTranslations("history");
  const format = await getFormatter();
  const { id } = await params;

  const saved = await getSaved(id);
  if (saved === "expired") redirect("/session-expired");
  if (saved === null) notFound();
  if (saved === "unavailable") {
    return (
      <div className={`container ${styles.page}`}>
        <Alert data-color="warning">{t("unavailable")}</Alert>
      </div>
    );
  }

  const when = format.dateTime(new Date(saved.createdAt), {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className={`container ${styles.page}`}>
      <div data-print="hide">
        <Link asChild>
          <NextLink href="/history">
            <ArrowLeftIcon aria-hidden />
            {t("back")}
          </NextLink>
        </Link>
      </div>

      <header>
        <Paragraph data-size="sm" className={styles.printOnly}>
          {t("printedFrom")}
        </Paragraph>
        <Heading level={1} data-size="md">
          {t("one")}
        </Heading>
        <Paragraph className={styles.description}>«{saved.description}»</Paragraph>
        <Paragraph data-size="sm" className={styles.meta}>
          {t("madeAt", { when })}
        </Paragraph>
      </header>

      <HistoryActions id={saved.id} />

      <ClassificationResult result={saved} />
    </div>
  );
}
