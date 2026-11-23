import { getTranslations } from "next-intl/server";
import { Heading, Paragraph, Tag } from "@digdir/designsystemet-react";
import {
  FileSearchIcon,
  PencilWritingIcon,
  RobotSmileIcon,
  SparklesIcon,
} from "@navikt/aksel-icons";
import styles from "./classify.module.css";

const STEPS = [
  { key: "rewrite", Icon: PencilWritingIcon },
  { key: "search", Icon: FileSearchIcon },
  { key: "choose", Icon: SparklesIcon },
] as const;

// The head of the classify page: says plainly that an AI assistant does
// the work, how it goes about it, and that it can be wrong
export async function AssistantIntro() {
  const t = await getTranslations("classify.assistant");

  return (
    <header className={styles.intro}>
      <div className={styles.introTop}>
        <span className={styles.robot} aria-hidden>
          <RobotSmileIcon />
        </span>
        <div>
          <Tag data-color="accent" data-size="sm" className={styles.aiTag}>
            <SparklesIcon aria-hidden /> {t("badge")}
          </Tag>
          <Heading level={1} data-size="lg">
            {t("title")}
          </Heading>
        </div>
      </div>
      <Paragraph>{t("lead")}</Paragraph>
      <ol className={styles.introSteps}>
        {STEPS.map(({ key, Icon }) => (
          <li key={key}>
            <Icon aria-hidden className={styles.introIcon} />
            <span>
              <strong>{t(`steps.${key}.title`)}</strong> {t(`steps.${key}.text`)}
            </span>
          </li>
        ))}
      </ol>
      <Paragraph data-size="sm" className={styles.muted}>
        {t("caution")}
      </Paragraph>
    </header>
  );
}
