import type { Metadata } from "next";
import NextLink from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Alert, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { DATATILSYNET_URL, LEGAL_UPDATED } from "@/lib/legal";
import { SITE } from "@/lib/site";
import styles from "@/components/pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return { title: `${t("title")} – Tollvakt` };
}

const COLLECTED = [
  "account",
  "classifications",
  "usage",
  "guests",
  "resetLinks",
  "feedback",
  "notStored",
] as const;
const PURPOSES = ["contract", "interest"] as const;
const PROCESSORS = ["netcup", "cloudflare", "google", "resend", "goatcounter"] as const;
const RETENTION = ["account", "usage", "resetLinks", "backups", "logs"] as const;
const COOKIES = ["session", "locale"] as const;

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
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
          {t("controller.title")}
        </Heading>
        <Paragraph>{t("controller.text", { name: SITE.ownerName })}</Paragraph>
        <Paragraph>
          {legal("contact")} <Link href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</Link>
        </Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("collected.title")}
        </Heading>
        <ul className={styles.list}>
          {COLLECTED.map((key) => (
            <li key={key}>{t(`collected.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("purposes.title")}
        </Heading>
        <ul className={styles.list}>
          {PURPOSES.map((key) => (
            <li key={key}>{t(`purposes.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("model.title")}
        </Heading>
        <Paragraph>{t("model.text1")}</Paragraph>
        <Paragraph>{t("model.text2")}</Paragraph>
        <Alert data-color="warning">{t("model.warning")}</Alert>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("processors.title")}
        </Heading>
        <Paragraph>{t("processors.text")}</Paragraph>
        <ul className={styles.list}>
          {PROCESSORS.map((key) => (
            <li key={key}>{t(`processors.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("transfers.title")}
        </Heading>
        <Paragraph>{t("transfers.text")}</Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("retention.title")}
        </Heading>
        <ul className={styles.list}>
          {RETENTION.map((key) => (
            <li key={key}>{t(`retention.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("cookies.title")}
        </Heading>
        <Paragraph>{t("cookies.text")}</Paragraph>
        <ul className={styles.list}>
          {COOKIES.map((key) => (
            <li key={key}>{t(`cookies.${key}`)}</li>
          ))}
        </ul>
        <Paragraph>{t("cookies.none")}</Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("rights.title")}
        </Heading>
        <Paragraph>{t("rights.text")}</Paragraph>
        <Paragraph>
          {t.rich("rights.self", {
            settings: (chunks) => (
              <Link asChild>
                <NextLink href="/settings">{chunks}</NextLink>
              </Link>
            ),
          })}
        </Paragraph>
        <Paragraph>
          {t("rights.ask")} <Link href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</Link>
        </Paragraph>
        <Paragraph>
          {t("rights.complaint")}{" "}
          <Link href={DATATILSYNET_URL} target="_blank" rel="noreferrer">
            datatilsynet.no
          </Link>
        </Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("security.title")}
        </Heading>
        <Paragraph>{t("security.text")}</Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("changes.title")}
        </Heading>
        <Paragraph>{t("changes.text")}</Paragraph>
      </section>
    </article>
  );
}
