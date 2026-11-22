import type { Request, Response } from "express";
import { listCountries } from "../services/countryService.js";

// GET /api/countries
export const list = async (req: Request, res: Response) => {
  // #swagger.tags = ["Countries"]
  /* #swagger.summary = "Countries for the origin country choice, with Norwegian and English names" */
  try {
    res.json(await listCountries());
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the countries" });
  }
};
