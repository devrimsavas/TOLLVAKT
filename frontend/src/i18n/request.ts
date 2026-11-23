import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  isLocale,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  type Locale,
} from "./config";

// The language is kept in a cookie instead of the URL: a chosen language
// wins, otherwise the browser's language decides.
export async function resolveLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

// Parts with their own texts (the privacy statement and terms of use, the
// feedback page) live in their own folders under messages/ and are merged
// in here, each as its own namespace
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const [app, legal, feedback] = await Promise.all([
    import(`../../messages/${locale}.json`),
    import(`../../messages/legal/${locale}.json`),
    import(`../../messages/feedback/${locale}.json`),
  ]);
  return {
    locale,
    messages: { ...app.default, ...legal.default, ...feedback.default },
    timeZone: "Europe/Oslo",
  };
});
