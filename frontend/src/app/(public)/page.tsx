import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Card,
  Heading,
  Link,
  Paragraph,
  Tag,
} from "@digdir/designsystemet-react";
import {
  ArrowRightIcon,
  ChatIcon,
  ClockDashedIcon,
  FileTextIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  QuestionmarkCircleIcon,
} from "@navikt/aksel-icons";
import { DATA_SOURCES } from "@/components/SiteFooter";
import styles from "./page.module.css";

const FEATURES = [
  { key: "describe", Icon: ChatIcon },
  { key: "reasons", Icon: FileTextIcon },
  { key: "questions", Icon: QuestionmarkCircleIcon },
  { key: "search", Icon: MagnifyingGlassIcon },
  { key: "history", Icon: ClockDashedIcon },
  { key: "languages", Icon: GlobeIcon },
] as const;

const STEPS = ["describe", "choose", "check"] as const;

// An example answer, so visitors see what they get before they try
const EXAMPLE = [
  { code: "6110.11.00", confidence: "high" },
  { code: "6110.12.00", confidence: "low" },
] as const;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const t = await getTranslations("home");
  const footer = await getTranslations("footer");
  const { deleted } = await searchParams;

  return (
    <>
      {deleted && (
        <div className={`container ${styles.notice}`}>
          <Alert data-color="success" role="status">
            {t("accountDeleted")}
          </Alert>
        </div>
      )}
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.heroText}>
            <Paragraph className={styles.eyebrow}>
              {t("hero.eyebrow")}
            </Paragraph>
            <Heading level={1} data-size="xl">
              {t("hero.title")}
            </Heading>
            <Paragraph data-size="lg" className={styles.lead}>
              {t("hero.lead")}
            </Paragraph>
            <div className={styles.heroActions}>
              <Button asChild data-size="lg">
                <NextLink href="/register">
                  {t("hero.primary")}
                  <ArrowRightIcon aria-hidden />
                </NextLink>
              </Button>
              <Button asChild variant="secondary" data-size="lg">
                <a href="#how-it-works">{t("hero.secondary")}</a>
              </Button>
            </div>
          </div>

          <figure className={styles.preview}>
            <Card className={styles.previewCard}>
              <div className={styles.previewHeader}>
                <Heading level={2} data-size="2xs">
                  {t("example.title")}
                </Heading>
              </div>
              <Paragraph data-size="sm">
                <strong>{t("example.description")}</strong>
              </Paragraph>
              <ul className={styles.previewList}>
                {EXAMPLE.map((item) => (
                  <li key={item.code} className={styles.previewItem}>
                    <div>
                      <span className={styles.previewCode}>{item.code}</span>{" "}
                      <Tag
                        data-size="sm"
                        data-color={item.confidence === "high" ? "success" : "warning"}
                      >
                        {t(`example.${item.confidence}`)}
                      </Tag>
                    </div>
                    <Paragraph data-size="sm">
                      {t(`example.${item.confidence}Reason`)}
                    </Paragraph>
                  </li>
                ))}
              </ul>
              <Paragraph data-size="sm">{t("example.question")}</Paragraph>
            </Card>
            <figcaption className={styles.previewCaption}>
              {t("example.caption")}
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        className={`container ${styles.section}`}
        aria-labelledby="features"
      >
        <Heading id="features" level={2} data-size="lg">
          {t("features.title")}
        </Heading>
        <Paragraph data-size="lg" className={styles.sectionLead}>
          {t("features.lead")}
        </Paragraph>
        <ul className={styles.features}>
          {FEATURES.map(({ key, Icon }) => (
            <li key={key}>
              <Card className={styles.feature}>
                <span className={styles.featureIcon}>
                  <Icon aria-hidden />
                </span>
                <Heading level={3} data-size="xs">
                  {t(`features.${key}.title`)}
                </Heading>
                <Paragraph>{t(`features.${key}.text`)}</Paragraph>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how-it-works"
        className={styles.band}
        aria-labelledby="how-it-works-title"
      >
        <div className={`container ${styles.section}`}>
          <Heading id="how-it-works-title" level={2} data-size="lg">
            {t("steps.title")}
          </Heading>
          <ol className={styles.steps}>
            {STEPS.map((key, index) => (
              <li key={key} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden>
                  {index + 1}
                </span>
                <Heading level={3} data-size="xs">
                  {t(`steps.${key}.title`)}
                </Heading>
                <Paragraph>{t(`steps.${key}.text`)}</Paragraph>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className={`container ${styles.section}`}
        aria-labelledby="sources"
      >
        <Heading id="sources" level={2} data-size="lg">
          {t("sources.title")}
        </Heading>
        <Paragraph data-size="lg" className={styles.sectionLead}>
          {t("sources.lead")}
        </Paragraph>
        <ul className={styles.sources}>
          {DATA_SOURCES.map((source) => (
            <li key={source.key} className={styles.source}>
              <Heading level={3} data-size="2xs">
                <Link href={source.url} target="_blank" rel="noreferrer">
                  {t(`sources.${source.key}.name`)}
                  <span className="visually-hidden">
                    {" "}
                    {footer("opensInNewTab")}
                  </span>
                </Link>
              </Heading>
              <Paragraph data-size="sm">
                {t(`sources.${source.key}.text`)}
              </Paragraph>
            </li>
          ))}
        </ul>
        <Alert data-color="info" className={styles.disclaimer}>
          {t("sources.notBinding")}
        </Alert>
      </section>

      <section className="container" aria-labelledby="cta">
        <div className={styles.cta}>
          <Heading id="cta" level={2} data-size="md">
            {t("cta.title")}
          </Heading>
          <Paragraph>{t("cta.text")}</Paragraph>
          <Button asChild data-size="lg">
            <NextLink href="/register">{t("cta.button")}</NextLink>
          </Button>
        </div>
      </section>
    </>
  );
}
