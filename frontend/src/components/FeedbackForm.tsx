"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Fieldset,
  Paragraph,
  Radio,
  Textfield,
} from "@digdir/designsystemet-react";
import { FEEDBACK_KINDS, FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH, type FeedbackKind } from "@/lib/feedback";
import { sendFeedbackAction, type FeedbackState } from "@/lib/feedbackActions";
import { SITE } from "@/lib/site";
import styles from "./FeedbackForm.module.css";

interface Props {
  // Filled in for a logged-in user; they can clear it to stay anonymous
  email: string;
  kind: FeedbackKind;
  // The page the user came from, sent with the feedback
  page: string;
}

// "Send more feedback" mounts a fresh form, with an empty answer
export function FeedbackForm(props: Props) {
  const [round, setRound] = useState(0);
  return <FeedbackFormRound key={round} {...props} onAgain={() => setRound((value) => value + 1)} />;
}

function FeedbackFormRound({ email, kind, page, onAgain }: Props & { onAgain: () => void }) {
  const t = useTranslations("feedback");
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedbackAction, {});

  if (state.sent) {
    return (
      <div className={styles.form}>
        <Alert data-color="success" role="status">
          {state.anonymous ? t("sentAnonymous") : t("sent")}
        </Alert>
        <div>
          <Button variant="secondary" onClick={onAgain}>
            {t("sendAnother")}
          </Button>
        </div>
      </div>
    );
  }

  const values = state.values;
  const messageError = state.fieldErrors?.message;
  const emailError = state.fieldErrors?.email;

  return (
    <form action={action} className={styles.form} noValidate>
      {state.formError && (
        <Alert data-color="danger" role="alert">
          {t(`errors.${state.formError}`, {
            minutes: state.retryMinutes ?? 1,
            email: SITE.contactEmail,
          })}
        </Alert>
      )}

      <Fieldset>
        <Fieldset.Legend>{t("kind.legend")}</Fieldset.Legend>
        {FEEDBACK_KINDS.map((value) => (
          <Radio
            key={value}
            name="kind"
            value={value}
            label={t(`kind.${value}`)}
            defaultChecked={(values?.kind ?? kind) === value}
          />
        ))}
      </Fieldset>

      <Textfield
        label={t("message")}
        description={t("messageHint")}
        name="message"
        multiline
        rows={6}
        counter={{
          limit: FEEDBACK_MAX_LENGTH,
          under: t("counter.under"),
          over: t("counter.over"),
        }}
        defaultValue={values?.message}
        error={
          messageError
            ? t(`errors.${messageError}`, { min: FEEDBACK_MIN_LENGTH, max: FEEDBACK_MAX_LENGTH })
            : undefined
        }
        required
      />

      <Textfield
        label={t("email")}
        description={t("emailHint")}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={values?.email ?? email}
        error={emailError ? t(`errors.${emailError}`) : undefined}
      />

      {/* A trap for robots: hidden from people and screen readers */}
      <div className={styles.trap} aria-hidden="true">
        <label>
          {t("website")}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="page" value={page} />

      <Paragraph data-size="sm" className={styles.muted}>
        {t("privacy")}
      </Paragraph>

      <div>
        <Button type="submit" loading={pending} disabled={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
