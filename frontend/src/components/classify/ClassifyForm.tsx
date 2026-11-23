"use client";

import NextLink from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Paragraph, Textfield } from "@digdir/designsystemet-react";
import { classifyAction, type ClassifyState } from "@/lib/classifyActions";
import { MAX_DESCRIPTION_LENGTH, type Usage } from "@/lib/classification";
import { ClassificationResult } from "./ClassificationResult";
import styles from "./classify.module.css";

// The description form and its answer. For a member on the classify page
// and for a guest on the landing page; the API decides whose quota counts.
export function ClassifyForm({ initialUsage }: { initialUsage: Usage | null }) {
  const t = useTranslations("classify");
  const [state, action, pending] = useActionState<ClassifyState, FormData>(
    classifyAction,
    {},
  );
  const usage = state.usage ?? initialUsage;
  const guest = usage?.scope === "guest";
  const usedUp = usage?.remaining === 0;

  return (
    <div className={styles.classify}>
      <form action={action} className={styles.form} noValidate>
        <Textfield
          label={t("label")}
          description={t("hint")}
          name="description"
          multiline
          rows={3}
          counter={{
            limit: MAX_DESCRIPTION_LENGTH,
            under: t("counter.under"),
            over: t("counter.over"),
          }}
          defaultValue={state.description}
          error={
            state.error === "descriptionRequired" || state.error === "descriptionTooLong"
              ? t(`errors.${state.error}`, { max: MAX_DESCRIPTION_LENGTH })
              : undefined
          }
          placeholder={t("placeholder")}
          required
        />
        <div className={styles.formFooter}>
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? t("working") : t("submit")}
          </Button>
          {usage && <UsageLine usage={usage} />}
        </div>
      </form>

      {state.error &&
        state.error !== "descriptionRequired" &&
        state.error !== "descriptionTooLong" && (
          <Alert data-color={state.error === "unavailable" ? "danger" : "warning"} role="alert">
            <Paragraph>{t(`errors.${state.error}`)}</Paragraph>
            {state.error === "quotaGuest" && (
              <Button asChild data-size="sm" className={styles.alertAction}>
                <NextLink href="/register">{t("register")}</NextLink>
              </Button>
            )}
          </Alert>
        )}

      {!state.error && guest && usedUp && !state.result && (
        <Alert data-color="info">
          <Paragraph>{t("errors.quotaGuest")}</Paragraph>
          <Button asChild data-size="sm" className={styles.alertAction}>
            <NextLink href="/register">{t("register")}</NextLink>
          </Button>
        </Alert>
      )}

      {state.result && (
        <div aria-live="polite">
          <ClassificationResult result={state.result} showSavedLink />
          {guest && (
            <Alert data-color="info" className={styles.guestNote}>
              <Paragraph>{t("guestNote")}</Paragraph>
              <Button asChild data-size="sm" className={styles.alertAction}>
                <NextLink href="/register">{t("register")}</NextLink>
              </Button>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

function UsageLine({ usage }: { usage: Usage }) {
  const t = useTranslations("classify.usage");
  if (usage.limit === null) return <span className={styles.usage}>{t("unlimited")}</span>;
  return (
    <span className={styles.usage}>
      {t("left", { remaining: usage.remaining ?? 0, limit: usage.limit })}
    </span>
  );
}
