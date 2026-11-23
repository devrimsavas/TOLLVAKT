import type { Metadata } from "next";
import NextLink from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Alert, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { LEGAL_UPDATED } from "@/lib/legal";
import { SITE } from "@/lib/site";
import styles from "@/components/pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  return { title: `${t("title")} – Tollvakt` };
}

// Sections that are a title and one paragraph, in the order shown
const SIMPLE = ["users", "data", "account"] as const;
const RULES = ["limits", "noBypass", "noMisuse", "noSecrets", "closing"] as const;
const AFTER = ["availability", "liability", "law"] as const;

export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  const legal = await getTranslations("legal");
  const format = await getFormatter();

  return (
    <article className={`container ${styles.page}`}>
      <header className={styles.intro}>
        <Heading level={1} data-size="xl">
          {t("title")}
        </Heading>
        <Paragraph data-size="lg" className={styles.lead}>
          {t("lead")}
        </Paragraph>
        <Paragraph data-size="sm" className={styles.muted}>
          {legal("updated", { date: format.dateTime(LEGAL_UPDATED, { dateStyle: "long" }) })}
        </Paragraph>
      </header>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("service.title")}
        </Heading>
        <Paragraph>{t("service.text", { name: SITE.ownerName })}</Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("notBinding.title")}
        </Heading>
        <Alert data-color="warning">{t("notBinding.text1")}</Alert>
        <Paragraph>{t("notBinding.text2")}</Paragraph>
      </section>

      {SIMPLE.map((key) => (
        <section key={key} className={styles.section}>
          <Heading level={2} data-size="md">
            {t(`${key}.title`)}
          </Heading>
          <Paragraph>{t(`${key}.text`)}</Paragraph>
        </section>
      ))}

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("use.title")}
        </Heading>
        <ul className={styles.list}>
          {RULES.map((key) => (
            <li key={key}>{t(`use.${key}`)}</li>
          ))}
        </ul>
        <Paragraph>
          <Link asChild>
            <NextLink href="/privacy">{legal("privacyLink")}</NextLink>
          </Link>
        </Paragraph>
      </section>

      {AFTER.map((key) => (
        <section key={key} className={styles.section}>
          <Heading level={2} data-size="md">
            {t(`${key}.title`)}
          </Heading>
          <Paragraph>{t(`${key}.text`)}</Paragraph>
        </section>
      ))}

      <Paragraph>
        {legal("contact")} <Link href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</Link>
      </Paragraph>
    </article>
  );
}
