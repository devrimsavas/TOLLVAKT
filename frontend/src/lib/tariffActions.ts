"use server";

import { treeChildren } from "./tariff";
import type { TreeNode } from "./tariffFormat";

// Opens a level of the tariff tree in the browser
export async function loadChildren(nodeId: number): Promise<TreeNode[] | null> {
  if (!Number.isInteger(nodeId) || nodeId < 1) return null;
  return treeChildren(nodeId);
}
