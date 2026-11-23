import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { ArrowLeftIcon } from "@navikt/aksel-icons";
import { TariffTree } from "@/components/tariff/TariffTree";
import { DutyCalculator } from "@/components/duty/DutyCalculator";
import { listCountries } from "@/lib/countries";
import { getCommodity, treeChildren } from "@/lib/tariff";
import { formatNodeCode, nodeText, type TreeNode } from "@/lib/tariffFormat";
import styles from "@/components/tariff/tariff.module.css";

// "61091000" or "6109.10.00"
function parseCode(value: string): string | null {
  const digits = value.replace(/[.\s]/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/search/[code]">): Promise<Metadata> {
  const { code } = await params;
  const parsed = parseCode(code);
  return { title: `${parsed ? formatNodeCode("commodity", parsed) : code} – Tollvakt` };
}

// The tariff's definitions come as HTML; they are shown as plain text, so
// nothing from outside is ever put into the page as markup
function plainText(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

export default async function CodePage({ params }: PageProps<"/search/[code]">) {
  const t = await getTranslations("tariff");
  const locale = await getLocale();
  const format = await getFormatter();
  const { code: raw } = await params;
  const code = parseCode(raw);
  if (!code) notFound();

  const details = await getCommodity(code);
  if (details === null) notFound();
  if (details === "unavailable") {
    return (
      <div className={`container ${styles.page}`}>
        <Alert data-color="warning">{t("unavailable")}</Alert>
      </div>
    );
  }

  // The tree, open along the code's path: the children of every level
  // above it are loaded on the server
  const openIds = details.path.map((level) => level.nodeId);
  const [countries, sections, ...levels] = await Promise.all([
    listCountries(),
    treeChildren(null),
    ...openIds.map((id) => treeChildren(id)),
  ]);
  const loaded: Record<number, TreeNode[]> = {};
  openIds.forEach((id, index) => {
    const children = levels[index] as TreeNode[] | null;
    if (children) loaded[id] = children;
  });

  const otherText =
    locale === "en" ? details.descriptionNb : details.descriptionEn;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: "long" });

  return (
    <div className={`container ${styles.page}`}>
      <Link asChild>
        <NextLink href="/search">
          <ArrowLeftIcon aria-hidden />
          {t("back")}
        </NextLink>
      </Link>

      <header>
        <ol className={styles.breadcrumbs} aria-label={t("path")}>
          {details.path.map((level) => {
            const levelCode = formatNodeCode(level.nodeType, level.code);
            return (
              <li key={level.nodeId}>
                {levelCode && <strong>{levelCode}</strong>}
                <span>{nodeText(level, locale)}</span>
              </li>
            );
          })}
        </ol>
        <Heading level={1} data-size="lg" className={styles.codeHeading}>
          {formatNodeCode("commodity", details.code)}
        </Heading>
        <Paragraph data-size="lg">{nodeText(details, locale)}</Paragraph>
        {otherText && (
          <Paragraph data-size="sm" className={styles.otherLanguage} lang={locale === "en" ? "nb" : "en"}>
            {otherText}
          </Paragraph>
        )}
      </header>

      <section aria-labelledby="facts">
        <Heading id="facts" level={2} data-size="xs">
          {t("facts")}
        </Heading>
        <dl className={styles.facts}>
          {details.hsCode && (
            <>
              <dt>{t("hsCode")}</dt>
              <dd>{details.hsCode}</dd>
            </>
          )}
          {details.unit && (
            <>
              <dt>{t("unit")}</dt>
              <dd>
                {details.unit}
                {details.unitDescription ? ` (${details.unitDescription})` : ""}
              </dd>
            </>
          )}
          <dt>{t("validFrom")}</dt>
          <dd>{date(details.validFrom)}</dd>
          {details.validTo && (
            <>
              <dt>{t("validTo")}</dt>
              <dd>{date(details.validTo)}</dd>
            </>
          )}
        </dl>
      </section>

      {details.references.length > 0 && (
        <section aria-labelledby="references">
          <Heading id="references" level={2} data-size="xs">
            {t("references")}
          </Heading>
          <ul className={styles.references}>
            {details.references.map((reference) => {
              const definition = plainText(
                locale === "en"
                  ? (reference.definitionEnHtml ?? reference.definitionNbHtml)
                  : (reference.definitionNbHtml ?? reference.definitionEnHtml),
              );
              return (
                <li key={`${reference.code}-${reference.attachedTo}`}>
                  <strong>{reference.expression ?? reference.code}</strong>
                  {definition && <Paragraph data-size="sm">{definition}</Paragraph>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="duty" className={styles.browse}>
        <Heading id="duty" level={2} data-size="xs">
          {t("duty")}
        </Heading>
        <Paragraph data-size="sm" className={styles.otherLanguage}>
          {t("dutyLead")}
        </Paragraph>
        {countries ? (
          <DutyCalculator code={details.code} countries={countries} />
        ) : (
          <Alert data-color="warning">{t("unavailable")}</Alert>
        )}
      </section>

      <section aria-labelledby="in-tariff" className={styles.browse}>
        <Heading id="in-tariff" level={2} data-size="xs">
          {t("inTariff")}
        </Heading>
        {sections ? (
          <TariffTree
            roots={sections}
            loaded={loaded}
            open={openIds}
            selectedId={details.nodeId ?? undefined}
          />
        ) : (
          <Alert data-color="warning">{t("unavailable")}</Alert>
        )}
      </section>

      <Paragraph data-size="sm" className={styles.otherLanguage}>
        {t("notBinding")}
      </Paragraph>
    </div>
  );
}
