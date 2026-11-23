import type { Metadata } from "next";
import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Alert,
  Heading,
  Paragraph,
  Search,
  SearchButton,
  SearchClear,
  SearchInput,
} from "@digdir/designsystemet-react";
import { TariffTree } from "@/components/tariff/TariffTree";
import { pathLevels } from "@/lib/classification";
import { searchTariff, treeChildren } from "@/lib/tariff";
import { formatNodeCode, nodeText } from "@/lib/tariffFormat";
import styles from "@/components/tariff/tariff.module.css";

const MAX_QUERY_LENGTH = 200;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tariff");
  return { title: `${t("title")} – Tollvakt` };
}

// Designsystemet components are client components: in a server component
// their parts are imported by name (SearchInput), not as Search.Input.
// The form is a plain GET form: the query is in the URL (?q=...), so a
// search can be bookmarked, shared and opened again with the back button.
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const t = await getTranslations("tariff");
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "nb";
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, MAX_QUERY_LENGTH) : "";

  const [result, sections] = await Promise.all([
    query ? searchTariff(query, lang) : null,
    treeChildren(null),
  ]);

  return (
    <div className={`container ${styles.page}`}>
      <header>
        <Heading level={1} data-size="lg">
          {t("title")}
        </Heading>
        <Paragraph>{t("lead")}</Paragraph>
      </header>

      <form action="/search" method="get" role="search">
        <Search>
          <SearchInput
            name="q"
            defaultValue={query}
            aria-label={t("label")}
            placeholder={t("placeholder")}
            maxLength={MAX_QUERY_LENGTH}
          />
          <SearchClear aria-label={t("clear")} />
          <SearchButton>{t("button")}</SearchButton>
        </Search>
      </form>

      {result === "unavailable" && <Alert data-color="warning">{t("unavailable")}</Alert>}

      {result && result !== "unavailable" && (
        <section aria-labelledby="results" className={styles.results}>
          <Heading id="results" level={2} data-size="xs">
            {t("results", { count: result.hits.length })}
          </Heading>
          {result.matched === "any" && result.hits.length > 0 && (
            <Paragraph data-size="sm">{t("someWords")}</Paragraph>
          )}
          {result.hits.length === 0 ? (
            <Paragraph>{t("noResults")}</Paragraph>
          ) : (
            <ul className={styles.hits}>
              {result.hits.map((hit) => {
                const levels = pathLevels(hit.context);
                return (
                  <li key={hit.code}>
                    <NextLink href={`/search/${hit.code}`} className={styles.hit}>
                      <span className={styles.hitCode}>
                        {formatNodeCode("commodity", hit.code)}
                      </span>
                      <span>{nodeText(hit, locale)}</span>
                      {levels.length > 1 && (
                        <span className={styles.hitPath}>
                          {levels.slice(0, -1).join(" › ")}
                        </span>
                      )}
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="browse" className={styles.browse}>
        <Heading id="browse" level={2} data-size="xs">
          {t("browse")}
        </Heading>
        {sections ? (
          <TariffTree roots={sections} />
        ) : (
          <Alert data-color="warning">{t("unavailable")}</Alert>
        )}
      </section>
    </div>
  );
}
