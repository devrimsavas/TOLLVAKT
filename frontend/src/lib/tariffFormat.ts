// How the tariff writes its codes. No server-only imports: used by client
// components too.

import { formatCode } from "./classification";

export interface TreeNode {
  id: number;
  nodeType: string;
  code: string | null;
  hsCode: string | null;
  descriptionNb: string | null;
  descriptionEn: string | null;
  hasChildren: boolean;
}

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

// Sections are numbered I to XXI in the tariff
export function romanNumeral(value: number): string {
  let rest = value;
  let out = "";
  for (const [amount, letters] of ROMAN) {
    while (rest >= amount) {
      out += letters;
      rest -= amount;
    }
  }
  return out;
}

// A node's code as the tariff writes it: section "XI", chapter "61",
// heading "61.09", subheading "6109.10", commodity "6109.10.00"
export function formatNodeCode(nodeType: string, code: string | null): string | null {
  if (!code) return null;
  if (nodeType === "section") {
    const number = Number(code);
    return Number.isInteger(number) && number > 0 ? romanNumeral(number) : code;
  }
  if (code.length === 4) return `${code.slice(0, 2)}.${code.slice(2)}`;
  if (code.length === 6) return `${code.slice(0, 4)}.${code.slice(4)}`;
  if (code.length === 8) return formatCode(code);
  return code;
}

export function nodeText(
  node: { descriptionNb: string | null; descriptionEn: string | null },
  locale: string,
): string {
  return (
    (locale === "en" ? node.descriptionEn : node.descriptionNb) ??
    node.descriptionNb ??
    node.descriptionEn ??
    ""
  );
}
