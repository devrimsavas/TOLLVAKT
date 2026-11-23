"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, ValidationMessage } from "@digdir/designsystemet-react";
import { MAX_DAILY_LIMIT } from "@/lib/adminRules";
import {
  setActiveAction,
  setDailyLimitAction,
  type UserChangeState,
} from "@/lib/adminActions";
import styles from "./admin.module.css";

// The daily limit and the open/closed state of one account
export function UserControls({
  userId,
  name,
  dailyLimit,
  defaultLimit,
  isActive,
  isAdmin,
  isSelf,
}: {
  userId: string;
  name: string;
  dailyLimit: number | null;
  defaultLimit: number;
  isActive: boolean;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations("admin.users");
  const [limitState, limitAction, limitPending] = useActionState<UserChangeState, FormData>(
    setDailyLimitAction,
    {},
  );
  const [activeState, activeAction, activePending] = useActionState<UserChangeState, FormData>(
    setActiveAction,
    {},
  );
  const error = limitState.error ?? activeState.error;

  return (
    <div className={styles.controls}>
      {!isAdmin && (
        <form action={limitAction} className={styles.limitForm}>
          <input type="hidden" name="userId" value={userId} />
          <label className={styles.limitLabel}>
            <span className="visually-hidden">{t("limitFor", { name })}</span>
            <input
              type="number"
              name="dailyLimit"
              min={0}
              max={MAX_DAILY_LIMIT}
              defaultValue={dailyLimit ?? defaultLimit}
              className={`ds-input ${styles.limitInput}`}
              data-size="sm"
            />
          </label>
          <Button type="submit" data-size="sm" variant="secondary" name="intent" value="set" disabled={limitPending}>
            {t("save")}
          </Button>
          {dailyLimit !== null && (
            <Button type="submit" data-size="sm" variant="tertiary" name="intent" value="default" disabled={limitPending}>
              {t("useDefault")}
            </Button>
          )}
        </form>
      )}
      <form action={activeAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
        <Button
          type="submit"
          data-size="sm"
          variant="secondary"
          data-color={isActive ? "danger" : undefined}
          disabled={activePending || isSelf}
          aria-label={isActive ? t("closeFor", { name }) : t("reopenFor", { name })}
        >
          {isActive ? t("close") : t("reopen")}
        </Button>
      </form>
      {error && <ValidationMessage data-size="sm">{t(`errors.${error}`)}</ValidationMessage>}
    </div>
  );
}
