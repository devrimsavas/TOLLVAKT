import type { Metadata } from "next";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Alert, Button, Heading, Paragraph, Tag } from "@digdir/designsystemet-react";
import { formatCode } from "@/lib/classification";
import { HISTORY_PAGE_SIZE, listHistory } from "@/lib/history";
import styles from "@/components/history/history.module.css";

const CONFIDENCE_COLORS = { high: "success", medium: "warning", low: "danger" } as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("history");
  return { title: `${t("title")} – Tollvakt` };
}

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const t = await getTranslations("history");
  const confidence = await getTranslations("classify.result.confidence");
  const format = await getFormatter();
  const { page: rawPage, deleted } = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof rawPage === "string" ? rawPage : "1", 10) || 1);

  const result = await listHistory(page);
  if (result === "expired") redirect("/session-expired");

  const pages =
    result === "unavailable" ? 1 : Math.max(1, Math.ceil(result.total / HISTORY_PAGE_SIZE));

  return (
    <div className={`container ${styles.page}`}>
      <header>
        <Heading level={1} data-size="lg">
          {t("title")}
        </Heading>
        <Paragraph>{t("lead")}</Paragraph>
      </header>

      {deleted && (
        <Alert data-color="success" role="status">
          {t("deleted")}
        </Alert>
      )}

      {result === "unavailable" && <Alert data-color="warning">{t("unavailable")}</Alert>}

      {result !== "unavailable" && result.total === 0 && (
        <div className={styles.empty}>
          <Paragraph>{t("empty")}</Paragraph>
          <Button asChild>
            <NextLink href="/classify">{t("toClassify")}</NextLink>
          </Button>
        </div>
      )}

      {result !== "unavailable" && result.items.length > 0 && (
        <>
          <Paragraph data-size="sm" className={styles.meta}>
            {t("count", { count: result.total })}
          </Paragraph>
          <ul className={styles.list}>
            {result.items.map((item) => (
              <li key={item.id}>
                <NextLink href={`/history/${item.id}`} className={styles.entry}>
                  <span className={styles.entryText}>{item.description}</span>
                  <span className={styles.entryMeta}>
                    {format.dateTime(new Date(item.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className={styles.entryCode}>
                    {item.topSuggestion ? (
                      <>
                        {formatCode(item.topSuggestion.code)}
                        <Tag
                          data-size="sm"
                          data-color={CONFIDENCE_COLORS[item.topSuggestion.confidence]}
                        >
                          {confidence(item.topSuggestion.confidence)}
                        </Tag>
                      </>
                    ) : (
                      <Tag data-size="sm" data-color="neutral">
                        {t("noCode")}
                      </Tag>
                    )}
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav className={styles.pager} aria-label={t("pages")}>
          {page > 1 ? (
            <Button asChild variant="secondary">
              <NextLink href={`/history?page=${page - 1}`}>{t("newer")}</NextLink>
            </Button>
          ) : (
            <span />
          )}
          <span className={styles.meta}>{t("pageOf", { page, pages })}</span>
          {page < pages ? (
            <Button asChild variant="secondary">
              <NextLink href={`/history?page=${page + 1}`}>{t("older")}</NextLink>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
