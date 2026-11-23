import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Alert,
  Heading,
  Paragraph,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tag,
} from "@digdir/designsystemet-react";
import { UserControls } from "@/components/admin/UserControls";
import { getAdminUsage, getAdminUsers } from "@/lib/admin";
import { requireUser } from "@/lib/user";
import styles from "@/components/admin/admin.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: `${t("title")} – Tollvakt` };
}

// Admins only: for anyone else the page does not exist. The API checks the
// role on every admin call too.
export default async function AdminPage() {
  const me = await requireUser();
  if (me.role !== "admin") notFound();
  const t = await getTranslations("admin");
  const format = await getFormatter();
  const [usage, users] = await Promise.all([getAdminUsage(), getAdminUsers()]);

  const days = usage ? [...usage.days].reverse() : [];
  const busiest = Math.max(1, ...days.map((day) => day.classify + day.search));
  const usedShare = usage
    ? Math.min(100, Math.round((usage.today.used / Math.max(1, usage.today.globalLimit)) * 100))
    : 0;

  return (
    <div className={`container ${styles.page}`}>
      <header>
        <Heading level={1} data-size="lg">
          {t("title")}
        </Heading>
        <Paragraph>{t("lead")}</Paragraph>
      </header>

      <section className={styles.section} aria-labelledby="today">
        <Heading id="today" level={2} data-size="sm">
          {t("today.title")}
        </Heading>
        {usage ? (
          <>
            <dl className={styles.stats}>
              <div className={styles.stat}>
                <dt>{t("today.used")}</dt>
                <dd>
                  {usage.today.used} / {usage.today.globalLimit}
                </dd>
                <div
                  className={styles.meter}
                  role="meter"
                  aria-label={t("today.used")}
                  aria-valuemin={0}
                  aria-valuemax={usage.today.globalLimit}
                  aria-valuenow={usage.today.used}
                >
                  <span style={{ width: `${usedShare}%` }} />
                </div>
              </div>
              <div className={styles.stat}>
                <dt>{t("today.remaining")}</dt>
                <dd>{usage.today.remaining}</dd>
              </div>
              <div className={styles.stat}>
                <dt>{t("today.limits")}</dt>
                <dd data-size="sm">
                  {t("today.limitsValue", {
                    guest: usage.limits.guest,
                    user: usage.limits.user,
                  })}
                </dd>
              </div>
            </dl>
            <Paragraph data-size="sm" className={styles.muted}>
              {t("today.note")}
            </Paragraph>
          </>
        ) : (
          <Alert data-color="warning">{t("unavailable")}</Alert>
        )}
      </section>

      <section className={styles.section} aria-labelledby="users">
        <Heading id="users" level={2} data-size="sm">
          {users ? t("users.title", { count: users.length }) : t("users.titlePlain")}
        </Heading>
        {users ? (
          <div className={styles.tableWrap}>
            <Table data-size="sm" className={styles.table}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t("users.user")}</TableHeaderCell>
                  <TableHeaderCell>{t("users.status")}</TableHeaderCell>
                  <TableHeaderCell className={styles.numeric}>{t("users.today")}</TableHeaderCell>
                  <TableHeaderCell className={styles.numeric}>{t("users.saved")}</TableHeaderCell>
                  <TableHeaderCell>{t("users.lastLogin")}</TableHeaderCell>
                  <TableHeaderCell>{t("users.limit")}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => {
                  const name = `${user.firstName} ${user.lastName}`;
                  return (
                    <TableRow key={user.userId}>
                      <TableCell>
                        <span className={styles.userName}>
                          {name}
                          <small>{user.email}</small>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={styles.tags}>
                          {user.role === "admin" && (
                            <Tag data-size="sm" data-color="accent">
                              {t("users.admin")}
                            </Tag>
                          )}
                          <Tag data-size="sm" data-color={user.isActive ? "success" : "danger"}>
                            {user.isActive ? t("users.active") : t("users.closed")}
                          </Tag>
                        </span>
                      </TableCell>
                      <TableCell className={styles.numeric}>
                        {user.effectiveDailyLimit === null
                          ? user.usedToday
                          : `${user.usedToday} / ${user.effectiveDailyLimit}`}
                      </TableCell>
                      <TableCell className={styles.numeric}>{user.classificationCount}</TableCell>
                      <TableCell>
                        {user.lastLoginAt
                          ? format.dateTime(new Date(user.lastLoginAt), {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : t("users.never")}
                      </TableCell>
                      <TableCell>
                        <UserControls
                          userId={user.userId}
                          name={name}
                          dailyLimit={user.dailyLimit}
                          defaultLimit={usage?.limits.user ?? 10}
                          isActive={user.isActive}
                          isAdmin={user.role === "admin"}
                          isSelf={user.userId === me.userId}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Alert data-color="warning">{t("unavailable")}</Alert>
        )}
      </section>
      {usage && (
        <section className={styles.section} aria-labelledby="per-day">
          <Heading id="per-day" level={2} data-size="sm">
            {t("days.title", { days: usage.days.length })}
          </Heading>
          <p className={styles.legend} aria-hidden>
            <span className={styles.legendClassify}>{t("days.classify")}</span>
            <span className={styles.legendSearch}>{t("days.search")}</span>
          </p>
          <div className={styles.tableWrap}>
            <Table data-size="sm" zebra className={styles.table}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t("days.date")}</TableHeaderCell>
                  <TableHeaderCell className={styles.numeric}>{t("days.classify")}</TableHeaderCell>
                  <TableHeaderCell className={styles.numeric}>{t("days.search")}</TableHeaderCell>
                  <TableHeaderCell className={styles.numeric}>{t("days.members")}</TableHeaderCell>
                  <TableHeaderCell className={styles.numeric}>{t("days.guests")}</TableHeaderCell>
                  <TableHeaderCell className={styles.barCell}>
                    <span className="visually-hidden">{t("days.bar")}</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {days.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>
                      {format.dateTime(new Date(`${day.date}T12:00:00`), {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </TableCell>
                    <TableCell className={styles.numeric}>{day.classify}</TableCell>
                    <TableCell className={styles.numeric}>{day.search}</TableCell>
                    <TableCell className={styles.numeric}>{day.members}</TableCell>
                    <TableCell className={styles.numeric}>{day.guests}</TableCell>
                    <TableCell className={styles.barCell}>
                      <div className={styles.bar} aria-hidden>
                        <span
                          className={styles.barClassify}
                          style={{ width: `${(day.classify / busiest) * 100}%` }}
                        />
                        <span
                          className={styles.barSearch}
                          style={{ width: `${(day.search / busiest) * 100}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

    </div>
  );
}
