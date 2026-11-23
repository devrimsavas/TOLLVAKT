"use client";

import NextLink from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Spinner } from "@digdir/designsystemet-react";
import { ChevronRightIcon } from "@navikt/aksel-icons";
import { loadChildren } from "@/lib/tariffActions";
import { formatNodeCode, nodeText, type TreeNode } from "@/lib/tariffFormat";
import styles from "./tariff.module.css";

// The tariff to browse: each level opens to the one below, down to the
// commodity codes, which link to their page. Levels are loaded when they
// are opened; the page can hand over some already loaded and open (the
// path to a code).
export function TariffTree({
  roots,
  loaded = {},
  open = [],
  selectedId,
}: {
  roots: TreeNode[];
  // Children already loaded, by the id of their parent
  loaded?: Record<number, TreeNode[]>;
  // Nodes open from the start
  open?: number[];
  // The node to point out (the code the page is about)
  selectedId?: number;
}) {
  const t = useTranslations("tariff.tree");
  const [children, setChildren] = useState<Record<number, TreeNode[]>>(loaded);
  const [expanded, setExpanded] = useState<Set<number>>(new Set(open));
  const [loading, setLoading] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function toggle(node: TreeNode) {
    const next = new Set(expanded);
    if (next.has(node.id)) {
      next.delete(node.id);
      setExpanded(next);
      return;
    }
    next.add(node.id);
    setExpanded(next);
    if (children[node.id]) return;
    setLoading(node.id);
    setFailed(null);
    startTransition(async () => {
      const nodes = await loadChildren(node.id);
      setLoading(null);
      if (nodes) setChildren((current) => ({ ...current, [node.id]: nodes }));
      else setFailed(node.id);
    });
  }

  function renderLevel(nodes: TreeNode[]) {
    return (
      <ul className={styles.level}>
        {nodes.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            expanded={expanded.has(node.id)}
            selected={node.id === selectedId}
            onToggle={() => toggle(node)}
          >
            {expanded.has(node.id) &&
              (loading === node.id ? (
                <p className={styles.status}>
                  <Spinner aria-hidden data-size="xs" /> {t("loading")}
                </p>
              ) : failed === node.id ? (
                <p className={styles.status} role="alert">
                  {t("failed")}
                </p>
              ) : children[node.id] ? (
                renderLevel(children[node.id]!)
              ) : null)}
          </TreeItem>
        ))}
      </ul>
    );
  }

  return <nav aria-label={t("label")} className={styles.tree}>{renderLevel(roots)}</nav>;
}

function TreeItem({
  node,
  expanded,
  selected,
  onToggle,
  children,
}: {
  node: TreeNode;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("tariff.tree");
  const locale = useLocale();
  const code = formatNodeCode(node.nodeType, node.code);
  const prefix =
    node.nodeType === "section" ? t("section") : node.nodeType === "chapter" ? t("chapter") : null;
  const label = (
    <>
      {code && (
        <span className={styles.nodeCode}>
          {prefix ? `${prefix} ${code}` : code}
        </span>
      )}
      <span className={styles.nodeText}>{nodeText(node, locale)}</span>
    </>
  );

  return (
    <li className={styles.item} data-type={node.nodeType} data-selected={selected || undefined}>
      {node.nodeType === "commodity" && node.code ? (
        <NextLink
          href={`/search/${node.code}`}
          className={styles.leaf}
          aria-current={selected ? "page" : undefined}
        >
          {label}
        </NextLink>
      ) : node.hasChildren ? (
        <button
          type="button"
          className={styles.branch}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronRightIcon aria-hidden className={styles.chevron} />
          {label}
        </button>
      ) : (
        <span className={styles.empty}>{label}</span>
      )}
      {children}
    </li>
  );
}
