import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Heading,
  Link,
  Paragraph,
} from "@digdir/designsystemet-react";
import { DATA_SOURCES } from "@/components/SiteFooter";
import { SITE } from "@/lib/site";
import styles from "@/components/pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: `${t("title")} – Tollvakt` };
}

const HOW = ["rewrite", "search", "choose"] as const;
const STORED = ["account", "classifications", "usage", "notStored"] as const;

export default async function AboutPage() {
  const t = await getTranslations("about");
  const footer = await getTranslations("footer");
  const legal = await getTranslations("legal");

  return (
    <article className={`container ${styles.page}`}>
      <header className={styles.intro}>
        <Heading level={1} data-size="xl">
          {t("title")}
        </Heading>
        <Paragraph data-size="lg" className={styles.lead}>
          {t("lead")}
        </Paragraph>
      </header>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("why.title")}
        </Heading>
        <Paragraph>{t("why.text1")}</Paragraph>
        <Paragraph>{t("why.text2")}</Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("how.title")}
        </Heading>
        <ul className={styles.list}>
          {HOW.map((key) => (
            <li key={key}>
              <strong>{t(`how.${key}.title`)}</strong> {t(`how.${key}.text`)}
            </li>
          ))}
        </ul>
        <Alert data-color="info">{t("how.limits")}</Alert>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("data.title")}
        </Heading>
        <Paragraph>{t("data.text")}</Paragraph>
        <ul className={styles.list}>
          {DATA_SOURCES.map((source) => (
            <li key={source.key}>
              <Link href={source.url} target="_blank" rel="noreferrer">
                {footer(source.key)}
              </Link>{" "}
              – {t(`data.${source.key}`)}
            </li>
          ))}
        </ul>
        <Paragraph data-size="sm" className={styles.muted}>
          {footer("license")}
        </Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("privacy.title")}
        </Heading>
        <ul className={styles.list}>
          {STORED.map((key) => (
            <li key={key}>{t(`privacy.${key}`)}</li>
          ))}
        </ul>
        <Paragraph>
          <Link asChild>
            <NextLink href="/privacy">{legal("aboutPrivacyLink")}</NextLink>
          </Link>
        </Paragraph>
      </section>

      <section className={`${styles.section} ${styles.project}`}>
        <Heading level={2} data-size="md">
          {t("project.title")}
        </Heading>
        <Paragraph>
          {SITE.ownerName
            ? t("project.byName", { name: SITE.ownerName })
            : t("project.text")}
        </Paragraph>
        <Paragraph>{t("project.independent")}</Paragraph>
        {SITE.contactEmail && (
          <Paragraph>
            {t("project.contact")}{" "}
            <Link href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</Link>
          </Paragraph>
        )}
        <div className={styles.actions}>
          <Button asChild variant="secondary">
            <a href={SITE.repositoryUrl} target="_blank" rel="noreferrer">
              {t("project.source")}
            </a>
          </Button>
        </div>
      </section>
    </article>
  );
}
