// The customs tariff as a tree to browse: sections, chapters, headings,
// subheadings and commodity codes, one level at a time.
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export interface TreeNode {
  id: number;
  nodeType: string;
  // Section "11", chapter "61", heading "6109", commodity "61091000";
  // null for unnumbered groups such as "andre:"
  code: string | null;
  hsCode: string | null;
  descriptionNb: string | null;
  descriptionEn: string | null;
  // Whether the node has levels below it, so the tree knows what can open
  hasChildren: boolean;
}

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());

// A commodity code that is no longer valid is left out; every other level
// is always shown
const CURRENT = `(n.node_type <> 'commodity' OR NOT EXISTS (
  SELECT 1 FROM commodities c WHERE c.code = n.code AND c.valid_to < :today
))`;

// The levels right below a node, in the tariff's order; the sections when
// parentId is null. null when the node does not exist.
export async function listChildren(parentId: number | null): Promise<TreeNode[] | null> {
  if (parentId !== null) {
    const [exists] = await sequelize.query("SELECT 1 FROM tariff_nodes WHERE id = :id", {
      type: QueryTypes.SELECT,
      replacements: { id: parentId },
    });
    if (!exists) return null;
  }

  const rows = await sequelize.query<{
    id: number;
    node_type: string;
    code: string | null;
    hs_code: string | null;
    description_nb: string | null;
    description_en: string | null;
    has_children: boolean;
  }>(
    `SELECT n.id, n.node_type, n.code, n.hs_code, n.description_nb, n.description_en,
            EXISTS (SELECT 1 FROM tariff_nodes k WHERE k.parent_id = n.id
                     AND (k.node_type <> 'commodity' OR NOT EXISTS (
                       SELECT 1 FROM commodities c WHERE c.code = k.code AND c.valid_to < :today
                     ))) AS has_children
       FROM tariff_nodes n
      WHERE ${parentId === null ? "n.parent_id IS NULL" : "n.parent_id = :parentId"}
        AND ${CURRENT}
      ORDER BY n.sort_order, n.id`,
    { type: QueryTypes.SELECT, replacements: { parentId, today: today() } },
  );
  return rows.map((row) => ({
    id: row.id,
    nodeType: row.node_type,
    code: row.code,
    hsCode: row.hs_code,
    descriptionNb: row.description_nb,
    descriptionEn: row.description_en,
    hasChildren: row.has_children,
  }));
}
