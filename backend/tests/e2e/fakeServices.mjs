// Loaded before the API when the web app's end-to-end tests run
// (npm run e2e:api, started by frontend/playwright.config.ts). It:
//   1. creates a fresh database for the run, with a small piece of the
//      tariff and its vectors,
//   2. answers for the language model, so classification works without the
//      network and always gives the same answers,
//   3. keeps the emails the API sends,
//   4. opens a small control server the tests use: read emails, clear the
//      day's usage.
// Plain JavaScript on the built API (dist/), so it uses the very modules
// the server uses. Never used in production: the normal start command does
// not load it.
import "dotenv/config";
import http from "node:http";
import { Sequelize } from "sequelize";

// ---- 1. A fresh database ----

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
// The database is dropped on every run, so only one made for this is accepted
if (!/^[a-z0-9_]+_e2e$/.test(databaseName)) {
  throw new Error(`The end-to-end database name must end with "_e2e", got "${databaseName}"`);
}
const serverUrl = new URL(databaseUrl);
serverUrl.pathname = "/postgres";
const server = new Sequelize(serverUrl.toString(), { logging: false });
await server.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
await server.query(`CREATE DATABASE "${databaseName}"`);
await server.close();

const { sequelize } = await import("../../dist/config/database.js");
const { runMigrations } = await import("../../dist/config/migrator.js");
const { fakeEmbedding } = await import("../../dist/services/embeddings/embedder.js");
const { FakeLlm, LlmError } = await import("../../dist/services/llm/llm.js");
const { setEmailSender } = await import("../../dist/services/email/emailSender.js");

// The server runs the migrations again on start and finds nothing to do
await runMigrations();

// T-shirts and sweaters, enough for a classification with a choice
const NODES = [
  // id, parent, type, code, nb, en
  [1, null, "section", "11", "Tekstilmaterialer og varer derav", "Textiles and textile articles"],
  [2, 1, "heading", "6109", "T-skjorter, singleter og andre undertrøyer, av trikotasje.", "T-shirts, singlets and other vests, knitted or crocheted."],
  [3, 2, "commodity", "61091000", "av bomull", "Of cotton"],
  [4, 2, "commodity", "61099000", "av andre tekstilmaterialer", "Of other textile materials"],
  [5, 1, "heading", "6110", "Gensere, pullovere, cardiganer, vester og lignende varer, av trikotasje.", "Jerseys, pullovers, cardigans, waistcoats and similar articles, knitted or crocheted."],
  [6, 5, "commodity", "61101100", "av ull", "Of wool"],
  [7, 5, "commodity", "61102000", "av bomull", "Of cotton"],
];
const byId = new Map(NODES.map((node) => [node[0], node]));
function chain(node) {
  const levels = [];
  for (let current = node; current; current = byId.get(current[1])) levels.unshift(current);
  return levels;
}
for (const node of NODES) {
  const [id, parent, type, code, nb, en] = node;
  const levels = chain(node);
  const join = (index) => levels.map((level) => level[index]).join(" > ");
  // Own text first, then the levels above up to the chapter, as the ETL builds it
  const own = (index) =>
    type === "section" ? null : levels.slice(1).reverse().map((level) => level[index]).join(" < ");
  await sequelize.query(
    `INSERT INTO tariff_nodes (id, parent_id, node_type, code, description_nb, description_en,
       search_text_nb, search_text_en, embedding_text_nb, embedding_text_en, sort_order, depth, path)
     VALUES (:id, :parent, :type, :code, :nb, :en, :searchNb, :searchEn, :embedNb, :embedEn, :id, :depth, :path)`,
    {
      replacements: {
        id, parent, type, code, nb, en,
        searchNb: join(4), searchEn: join(5), embedNb: own(4), embedEn: own(5),
        depth: levels.length - 1,
        path: levels.map((level) => level[3]).join("/"),
      },
    },
  );
  if (type === "commodity") {
    await sequelize.query(
      `INSERT INTO commodities (code, node_id, unit, valid_from) VALUES (:code, :id, 'KG', '1988-01-01')`,
      { replacements: { code, id } },
    );
  }
}
const [texts] = await sequelize.query(
  `SELECT embedding_hash_nb AS hash, embedding_text_nb AS text FROM tariff_nodes WHERE node_type = 'commodity'
   UNION SELECT embedding_hash_en, embedding_text_en FROM tariff_nodes WHERE node_type = 'commodity'`,
);
for (const row of texts) {
  await sequelize.query(
    "INSERT INTO text_embeddings (model, text_hash, embedding) VALUES ('fake', :hash, CAST(:vector AS vector))",
    { replacements: { hash: row.hash, vector: `[${fakeEmbedding(row.text).join(",")}]` } },
  );
}
await sequelize.query("ANALYZE");

// Duty, VAT and exchange rates for the duty calculator: T-shirts have an
// ordinary rate in percent and duty-free preferences from the EU and
// Türkiye; wool sweaters an ordinary rate per kg
const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
await sequelize.query(`
  INSERT INTO country_groups (code, name_nb, preference_code, valid_from) VALUES
    ('TALL', 'Toll fra alle land (ordinær toll)', 'N', '1990-01-01'),
    ('TEF', 'Toll fra EU- land', 'B', '1990-01-01'),
    ('TTYR', 'Toll fra Tyrkia', 'P', '1990-01-01'),
    ('ALLE', 'Avgift fra alle land', 'N', '1990-01-01');
  INSERT INTO countries (code, name_nb) VALUES ('DE', 'Tyskland'), ('TR', 'Tyrkia'), ('CN', 'Kina');
  INSERT INTO country_group_members (country_code, group_code, valid_from) VALUES
    ('DE', 'TEF', '1990-01-01'), ('TR', 'TTYR', '1992-04-17');
  INSERT INTO duty_rates (commodity_code, duty_kind, country_group_code, rate_unit, rate_value, rate_raw, valid_from) VALUES
    ('61091000', 'customs', 'TALL', 'P', 10.7, '10,70', '2004-01-01'),
    ('61091000', 'customs', 'TEF', 'P', 0, '0,00', '1996-01-01'),
    ('61091000', 'customs', 'TTYR', 'P', 0, '0,00', '1996-01-01'),
    ('61101100', 'customs', 'TALL', 'K', 30, '30,00', '2004-01-01');
  INSERT INTO fees (direction, commodity_code, country_group_code, fee_type, fee_group, fee_group_description, rate_value, rate_raw, rate_unit, valid_from) VALUES
    ('import', '61091000', 'ALLE', 'MV', 1, 'Merverdiavgift', 25, '25,00', 'P', '2005-01-01'),
    ('import', '61101100', 'ALLE', 'MV', 1, 'Merverdiavgift', 25, '25,00', 'P', '2005-01-01');
`);
await sequelize.query(
  `INSERT INTO exchange_rates (currency_code, valid_from, valid_to, description, rate, rate_raw, unit) VALUES
     ('EUR', :from, :to, 'EURO', 11.5, '11,500', 1),
     ('USD', :from, :to, 'US DOLLAR', 10.0, '10,000', 1)`,
  { replacements: { from: isoDay(-7), to: isoDay(7) } },
);

// ---- 2. The language model ----

// The rewrite returns the description as it is. The classification picks
// by words in the description, so the tests can ask for each kind of answer:
//   "ull" / "wool"        the wool sweater, with a question about the wool
//   "bomull" / "cotton"   the cotton T-shirt, high confidence
//   "ingenting" / "nothing"  no code fits
//   "feil" / "fail"       the model fails (the API answers 503)
FakeLlm.answer = (request) => {
  const description = JSON.parse(request.prompt.match(/description: (".*")/)?.[1] ?? '""').toLowerCase();
  if (!("suggestions" in request.schema.properties)) {
    return { nb: description, en: description };
  }
  if (/\b(feil|fail)\b/.test(description)) throw new LlmError("The fake model is down");
  if (/\b(ingenting|nothing)\b/.test(description)) {
    return { suggestions: [], missingInformation: ["Kapittel 95: leketøy"] };
  }
  if (/\b(ull|wool)\b/.test(description)) {
    return {
      suggestions: [
        { code: "61101100", reason: "Strikket genser av ull.", confidence: "high" },
        { code: "61102000", reason: "Hvis genseren er av bomull.", confidence: "low" },
      ],
      missingInformation: ["Hva slags ull er genseren laget av?"],
    };
  }
  return {
    suggestions: [{ code: "61091000", reason: "Strikket T-skjorte av bomull.", confidence: "high" }],
    missingInformation: [],
  };
};

// ---- 3. Emails ----

const sent = [];
setEmailSender({ send: async (email) => void sent.push(email) });

// ---- 4. Control server for the tests ----

// GET /emails?to={address}   the emails sent to that address
// DELETE /usage              forgets the day's usage, so quotas start again
const controlPort = Number(process.env.E2E_CONTROL_PORT ?? 3199);
http
  .createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://control");
    try {
      if (request.method === "GET" && url.pathname === "/emails") {
        const to = url.searchParams.get("to") ?? "";
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(sent.filter((email) => email.to === to)));
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/usage") {
        await sequelize.query("DELETE FROM usage_events");
        response.writeHead(204).end();
        return;
      }
      response.writeHead(404).end();
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  })
  .listen(controlPort, "127.0.0.1");

console.log(
  `End-to-end mode: fresh database "${databaseName}", fake models, control server on ${controlPort}`,
);
