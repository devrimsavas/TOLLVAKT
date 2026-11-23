import type appMessages from "../../messages/en.json";
import type legalMessages from "../../messages/legal/en.json";
import type { Locale } from "./config";

// Makes translation keys type-checked: a missing or misspelled key is a
// compile error. The English files are the source; the Norwegian ones
// must have the same keys.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof appMessages & typeof legalMessages;
  }
}
