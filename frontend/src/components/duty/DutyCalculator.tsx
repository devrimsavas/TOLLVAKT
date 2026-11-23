"use client";

import { startTransition, useActionState, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Heading,
  Label,
  Paragraph,
  Select,
  Table,
  Tag,
  Textfield,
} from "@digdir/designsystemet-react";
import { calculateDutyAction, type DutyState } from "@/lib/dutyActions";
import { CURRENCIES, type Country, type DutyLine, type DutyNote, type DutyResult } from "@/lib/duty";
import styles from "./duty.module.css";

// Customs duty and import VAT for the code on the page: the importer gives
// the origin country, the value and, when the rate needs it, the quantity
export function DutyCalculator({ code, countries }: { code: string; countries: Country[] }) {
  const t = useTranslations("duty");
  const locale = useLocale();
  const [state, action, pending] = useActionState<DutyState, FormData>(calculateDutyAction, {});
  const values = state.values ?? {};
  // The form is sent by hand rather than with action=: React empties a form
  // after its action, and the importer will often change one field and
  // calculate again
  const [origin, setOrigin] = useState("");
  const [currency, setCurrency] = useState("NOK");
  const [proof, setProof] = useState(false);
  const sorted = [...countries].sort((a, b) =>
    (locale === "en" ? a.nameEn : a.nameNb).localeCompare(locale === "en" ? b.nameEn : b.nameNb, locale),
  );

  return (
    <div className={styles.calculator}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <input type="hidden" name="commodityCode" value={code} />
        <div className={styles.row}>
          <Field>
            <Label>{t("origin")}</Label>
            <Select
              name="originCountry"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              required
            >
              <Select.Option value="" disabled>
                {t("chooseCountry")}
              </Select.Option>
              {sorted.map((country) => (
                <Select.Option key={country.code} value={country.code}>
                  {locale === "en" ? country.nameEn : country.nameNb}
                </Select.Option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>{t("currency")}</Label>
            <Select
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {CURRENCIES.map((currency) => (
                <Select.Option key={currency} value={currency}>
                  {currency}
                </Select.Option>
              ))}
            </Select>
          </Field>
        </div>
        <div className={styles.row}>
          <Textfield
            label={t("value")}
            description={t("valueHint")}
            name="value"
            inputMode="decimal"
            defaultValue={values.value}
            error={state.error === "valueInvalid" ? t("errors.valueInvalid") : undefined}
            required
          />
          <Textfield label={t("freight")} name="freight" inputMode="decimal" defaultValue={values.freight} />
          <Textfield label={t("insurance")} name="insurance" inputMode="decimal" defaultValue={values.insurance} />
        </div>
        <div className={styles.row}>
          <Textfield
            label={t("netWeightKg")}
            name="netWeightKg"
            inputMode="decimal"
            defaultValue={values.netWeightKg}
          />
          <Textfield label={t("liters")} name="liters" inputMode="decimal" defaultValue={values.liters} />
          <Textfield label={t("pieces")} name="pieces" inputMode="numeric" defaultValue={values.pieces} />
        </div>
        <Paragraph data-size="sm" className={styles.muted}>
          {t("quantityHint")}
        </Paragraph>
        <Checkbox
          label={t("proofOfOrigin")}
          description={t("proofOfOriginHint")}
          name="hasProofOfOrigin"
          checked={proof}
          onChange={(event) => setProof(event.target.checked)}
        />
        <div>
          <Button type="submit" loading={pending} disabled={pending}>
            {t("submit")}
          </Button>
        </div>
      </form>

      {state.error && state.error !== "valueInvalid" && (
        <Alert data-color={state.error === "unavailable" ? "danger" : "warning"} role="alert">
          {t(`errors.${state.error}`)}
        </Alert>
      )}

      {state.result && !pending && <DutyResultView result={state.result} />}
    </div>
  );
}

function DutyResultView({ result }: { result: DutyResult }) {
  const t = useTranslations("duty.result");
  const format = useFormatter();
  const nok = (amount: number | null) =>
    amount === null ? t("unknown") : format.number(amount, { style: "currency", currency: "NOK" });
  const rate = (line: DutyLine) =>
    line.rate === null
      ? line.rateRaw
      : line.rateUnit === "P"
        ? `${format.number(line.rate)} %`
        : t(`perUnit.${perUnit(line.rateUnit)}`, { rate: format.number(line.rate) });

  const { duty } = result;
  return (
    <section className={styles.result} aria-labelledby="duty-result" aria-live="polite">
      <Heading id="duty-result" level={3} data-size="xs">
        {t("title", { country: result.origin.name })}
      </Heading>

      <Table data-size="sm" className={styles.table}>
        <tbody>
          <tr>
            <th scope="row">{t("customsValue")}</th>
            <td />
            <td className={styles.amount}>{nok(result.customsValueNok)}</td>
          </tr>
          {duty.ordinary && (
            <tr data-applied={duty.applied === "ordinary" || undefined}>
              <th scope="row">
                {t("ordinary")}
                {duty.applied === "ordinary" && (
                  <Tag data-size="sm" data-color="accent" className={styles.tag}>
                    {t("applied")}
                  </Tag>
                )}
              </th>
              <td>{rate(duty.ordinary)}</td>
              <td className={styles.amount}>{nok(duty.ordinary.amountNok)}</td>
            </tr>
          )}
          {duty.preferential && (
            <tr data-applied={duty.applied === "preferential" || undefined}>
              <th scope="row">
                {t("preferential", { group: duty.preferential.groupName ?? duty.preferential.group })}
                {duty.applied === "preferential" && (
                  <Tag data-size="sm" data-color="accent" className={styles.tag}>
                    {t("applied")}
                  </Tag>
                )}
              </th>
              <td>{rate(duty.preferential)}</td>
              <td className={styles.amount}>{nok(duty.preferential.amountNok)}</td>
            </tr>
          )}
          {result.additionalDuty.map((line) => (
            <tr key={line.group}>
              <th scope="row">{t("additional", { group: line.groupName ?? line.group })}</th>
              <td>{rate(line)}</td>
              <td className={styles.amount}>{nok(line.amountNok)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{t("vatBase")}</th>
            <td />
            <td className={styles.amount}>{nok(result.vat.baseNok)}</td>
          </tr>
          <tr>
            <th scope="row">{t("vat")}</th>
            <td>{format.number(result.vat.rate)} %</td>
            <td className={styles.amount}>{nok(result.vat.amountNok)}</td>
          </tr>
          <tr className={styles.total}>
            <th scope="row">{t("total")}</th>
            <td />
            <td className={styles.amount}>{nok(result.totalNok)}</td>
          </tr>
        </tbody>
      </Table>

      {duty.possibleSavingNok !== null && duty.possibleSavingNok > 0 && (
        <Alert data-color="success">{t("saving", { amount: nok(duty.possibleSavingNok) })}</Alert>
      )}

      {result.notes.length > 0 && (
        <div className={styles.notes}>
          <Heading level={4} data-size="2xs">
            {t("notesTitle")}
          </Heading>
          <ul>
            {result.notes.map((note, index) => (
              <li key={index}>
                <NoteText note={note} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.restrictions.length > 0 && (
        <div className={styles.notes}>
          <Heading level={4} data-size="2xs">
            {t("restrictions")}
          </Heading>
          <ul>
            {result.restrictions.map((restriction, index) => (
              <li key={index}>
                {restriction.restrictionTypeDescription ?? restriction.restrictionType}
                {restriction.restrictionGroupDescription
                  ? ` – ${restriction.restrictionGroupDescription}`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.otherFees.length > 0 && (
        <div className={styles.notes}>
          <Heading level={4} data-size="2xs">
            {t("otherFees")}
          </Heading>
          <ul>
            {result.otherFees.map((fee, index) => (
              <li key={index}>{fee.feeGroupDescription ?? fee.feeTypeDescription ?? fee.feeType}</li>
            ))}
          </ul>
        </div>
      )}

      <Paragraph data-size="sm" className={styles.muted}>
        {result.exchangeRates.map((exchange) => (
          <span key={exchange.currency}>
            {t("exchangeRate", {
              unit: exchange.unit,
              currency: exchange.currency,
              rate: format.number(exchange.rate, { maximumFractionDigits: 4 }),
              from: format.dateTime(new Date(exchange.validFrom), { dateStyle: "medium" }),
            })}{" "}
          </span>
        ))}
        {t("notBinding")}
      </Paragraph>
    </section>
  );
}

// The rate units of Tolletaten's data; an unknown one is shown per kg,
// the most common
function perUnit(unit: string | null): "K" | "L" | "S" {
  return unit === "L" || unit === "S" ? unit : "K";
}

function NoteText({ note }: { note: DutyNote }) {
  const t = useTranslations("duty.notes");
  const format = useFormatter();
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" });
  switch (note.code) {
    case "notValid":
      return <>{t("notValid", { date: date(note.values.date) })}</>;
    case "outOfSeason":
      return <>{t("outOfSeason", { date: date(note.values.date) })}</>;
    case "noOrdinaryRate":
      return <>{t("noOrdinaryRate")}</>;
    case "quantityMissing":
      return <>{t(`quantityMissing.${note.values.quantity as "netWeightKg" | "liters" | "pieces"}`)}</>;
    case "placeholderRate":
      return <>{t("placeholderRate", { rate: note.values.rate })}</>;
    case "rawMaterial":
      return <>{t("rawMaterial")}</>;
    case "reducedVat":
      return <>{t("reducedVat", { rate: note.values.rate })}</>;
    case "otherFees":
      return <>{t("otherFees")}</>;
  }
}
