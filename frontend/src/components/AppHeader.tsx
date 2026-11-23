import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/user";
import { HOME_AFTER_LOGIN } from "@/lib/redirect";
import { Logo } from "./Logo";
import { AppNav } from "./AppNav";
import { ColorSchemeToggle } from "./ColorSchemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import { UserMenu } from "./UserMenu";
import styles from "./SiteHeader.module.css";

// The header on pages for logged-in users
export async function AppHeader({ user }: { user: CurrentUser }) {
  const t = await getTranslations("header");
  const app = await getTranslations("app.nav");
  const locale = await getLocale();

  const links = [
    { href: "/classify", text: app("classify") },
    { href: "/history", text: app("history") },
    { href: "/search", text: app("search") },
    ...(user.role === "admin" ? [{ href: "/admin", text: app("admin") }] : []),
  ];
  const name = `${user.firstName} ${user.lastName}`;

  return (
    <header className={`${styles.header} ${styles.app}`} data-print="hide">
      <div className={`container ${styles.inner}`}>
        <NextLink
          href={HOME_AFTER_LOGIN}
          className={styles.home}
          aria-label={app("home")}
        >
          <Logo />
        </NextLink>

        <AppNav label={app("label")} links={links} />

        <div className={styles.actions}>
          <LanguageSwitcher
            target={locale === "nb" ? "en" : "nb"}
            text={t("switchLanguage")}
            label={t("switchLanguageLabel")}
          />
          <ColorSchemeToggle label={t("colorScheme")} />
          <UserMenu
            name={name}
            email={user.email}
            label={app("account", { name })}
            logoutLabel={t("logOut")}
            settingsLabel={t("settings")}
          />
          <MobileMenu
            label={t("menu")}
            links={[...links, { href: "/settings", text: t("settings") }]}
            logoutLabel={t("logOut")}
          />
        </div>
      </div>
    </header>
  );
}
