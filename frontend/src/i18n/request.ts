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

// The privacy statement and the terms of use are long texts that change on
// their own, so they live in messages/legal/ and are merged in here
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const [app, legal] = await Promise.all([
    import(`../../messages/${locale}.json`),
    import(`../../messages/legal/${locale}.json`),
  ]);
  return {
    locale,
    messages: { ...app.default, ...legal.default },
    timeZone: "Europe/Oslo",
  };
});
