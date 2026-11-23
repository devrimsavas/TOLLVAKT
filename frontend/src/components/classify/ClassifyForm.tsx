"use client";

import NextLink from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Paragraph, Spinner, Textfield } from "@digdir/designsystemet-react";
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

      {pending && <Progress />}

      {!pending &&
        state.error &&
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

      {!pending && state.result && (
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

const PROGRESS_STEPS = ["reading", "searching", "comparing", "writing"] as const;
const STEP_MS = 2500;

// What the assistant is doing while the answer is on its way. The steps are
// the real ones, in order; the timing is only an estimate, so the last one
// stays until the answer comes.
function Progress() {
  const t = useTranslations("classify.progress");
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, PROGRESS_STEPS.length - 1)),
      STEP_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.progress} role="status">
      <Spinner aria-hidden data-size="sm" />
      <ol>
        {PROGRESS_STEPS.map((key, index) => (
          <li key={key} data-state={index < step ? "done" : index === step ? "active" : "waiting"}>
            {t(key)}
          </li>
        ))}
      </ol>
    </div>
  );
}
