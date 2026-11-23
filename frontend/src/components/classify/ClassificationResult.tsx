import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Card, Heading, Link, Paragraph, Tag } from "@digdir/designsystemet-react";
import { SparklesIcon } from "@navikt/aksel-icons";
import {
  formatCode,
  pathLevels,
  type Classification,
  type Confidence,
} from "@/lib/classification";
import styles from "./classify.module.css";

const CONFIDENCE_COLORS: Record<Confidence, "success" | "warning" | "danger"> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

// The answer to a classification: the suggested codes with their place in
// the tariff, the reasons and how sure each one is, and the questions whose
// answers would decide between them. Used right after classifying and on a
// saved classification.
export function ClassificationResult({
  result,
  showSavedLink = false,
}: {
  result: Classification;
  // Right after classifying, a member is told where the result is kept
  showSavedLink?: boolean;
}) {
  const t = useTranslations("classify.result");
  const locale = useLocale();

  return (
    <section className={styles.result} aria-labelledby="result-title">
      <div className={styles.resultHeader}>
        <Heading id="result-title" level={2} data-size="sm">
          {result.suggestions.length > 0 ? t("title") : t("noneTitle")}
        </Heading>
        <span className={styles.byAssistant}>
          <SparklesIcon aria-hidden /> {t("byAssistant")}
        </span>
      </div>

      {result.suggestions.length === 0 && (
        <Alert data-color="warning">{t("none")}</Alert>
      )}

      <ol className={styles.suggestions}>
        {result.suggestions.map((suggestion, index) => {
          const description =
            (locale === "en" ? suggestion.descriptionEn : suggestion.descriptionNb) ??
            suggestion.descriptionNb ??
            suggestion.descriptionEn;
          const levels = pathLevels(suggestion.context);
          return (
            <li key={suggestion.code}>
              <Card className={styles.suggestion} data-variant={index === 0 ? "tinted" : undefined}>
                <div className={styles.suggestionHeader}>
                  <NextLink
                    href={`/search/${suggestion.code}`}
                    className={styles.code}
                    aria-label={t("openCode", { code: formatCode(suggestion.code) })}
                  >
                    {formatCode(suggestion.code)}
                  </NextLink>
                  <Tag data-size="sm" data-color={CONFIDENCE_COLORS[suggestion.confidence]}>
                    {t(`confidence.${suggestion.confidence}`)}
                  </Tag>
                </div>
                {description && (
                  <Paragraph className={styles.codeText}>
                    {/* The code's own text is often only "of wool" or
                        "other": the level above makes it readable */}
                    {levels.length >= 2
                      ? `${levels[levels.length - 2]} – ${description}`
                      : description}
                  </Paragraph>
                )}
                <Paragraph>{suggestion.reason}</Paragraph>
                {levels.length > 0 && (
                  <details className={styles.path}>
                    <summary>{t("path")}</summary>
                    <ol>
                      {levels.map((level, levelIndex) => (
                        <li key={levelIndex}>{level}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      {result.missingInformation.length > 0 && (
        <div className={styles.questions}>
          <Heading level={3} data-size="2xs">
            {result.suggestions.length > 0 ? t("questions") : t("noneHint")}
          </Heading>
          <ul>
            {result.missingInformation.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </div>
      )}

      {result.rewritten && (
        <Paragraph data-size="sm" className={styles.muted}>
          {t("searchedFor", {
            words: locale === "en" ? result.rewritten.en : result.rewritten.nb,
          })}
        </Paragraph>
      )}

      {showSavedLink && result.id && (
        <Paragraph data-size="sm">
          {t("saved")}{" "}
          <Link asChild>
            <NextLink href={`/history/${result.id}`}>{t("openSaved")}</NextLink>
          </Link>
        </Paragraph>
      )}

      <Paragraph data-size="sm" className={styles.muted}>
        {t("notBinding")}
      </Paragraph>
    </section>
  );
}
