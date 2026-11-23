"use client";

import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Dialog, Heading, Paragraph } from "@digdir/designsystemet-react";
import { PrinterSmallIcon, TrashIcon } from "@navikt/aksel-icons";
import { deleteClassificationAction, type DeleteState } from "@/lib/historyActions";
import styles from "./history.module.css";

// Print the classification, or delete it after a question, since a deleted
// classification cannot be brought back
export function HistoryActions({ id }: { id: string }) {
  const t = useTranslations("history.actions");
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<DeleteState, FormData>(
    deleteClassificationAction,
    {},
  );

  return (
    <div className={styles.actions} data-print="hide">
      <Button variant="secondary" onClick={() => window.print()}>
        <PrinterSmallIcon aria-hidden />
        {t("print")}
      </Button>
      <Button variant="secondary" data-color="danger" onClick={() => dialog.current?.showModal()}>
        <TrashIcon aria-hidden />
        {t("delete")}
      </Button>
      <Dialog ref={dialog} closedby="any" closeButton={t("cancel")}>
        <div className={styles.dialog}>
          <Heading level={2} data-size="xs">
            {t("confirmTitle")}
          </Heading>
          <Paragraph>{t("confirmText")}</Paragraph>
          {state.failed && (
            <Alert data-color="danger" role="alert">
              {t("failed")}
            </Alert>
          )}
          <form action={action} className={styles.dialogActions}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" data-color="danger" loading={pending} disabled={pending}>
              {t("confirm")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              {t("cancel")}
            </Button>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
