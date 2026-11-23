import type { Request, Response } from "express";
import { listChildren } from "../services/tariffTreeService.js";

// GET /api/tariff/tree
export const sections = async (req: Request, res: Response) => {
  // #swagger.tags = ["Tariff tree"]
  /* #swagger.summary = "The top of the tariff: its sections"
     #swagger.description = "Each node says whether it has levels below it (hasChildren); open one with GET /api/tariff/tree/{nodeId}/children. Free: no quota." */
  try {
    res.json(await listChildren(null));
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the tariff" });
  }
};

// GET /api/tariff/tree/:nodeId/children
export const children = async (req: Request, res: Response) => {
  // #swagger.tags = ["Tariff tree"]
  /* #swagger.summary = "The levels right below a node of the tariff"
     #swagger.description = "Chapters below a section, headings below a chapter, and so on down to the commodity codes, in the tariff's order. Codes that are no longer valid are left out."
     #swagger.parameters["nodeId"] = { in: "path", type: "integer", example: 1 } */
  const nodeId = Number(req.params.nodeId);
  if (!Number.isInteger(nodeId) || nodeId < 1) {
    res.status(400).json({ error: "nodeId must be a whole number from 1" });
    return;
  }
  try {
    const nodes = await listChildren(nodeId);
    if (!nodes) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    res.json(nodes);
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the tariff" });
  }
};
