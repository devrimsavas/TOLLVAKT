// Rewrites an importer's description of a product into the wording of the
// customs tariff, in Norwegian and English, before searching.
//
// People write "kosebamse", "spillkonsoll", "bærbar PC"; the tariff says
// "leketøy som forestiller dyr", "videospillkonsoller", "bærbare automatiske
// databehandlingsmaskiner". Neither word search nor the embedding model
// bridges gaps that wide, so a language model translates first.
import { createLlm, generateJsonWithRetry, type JsonSchema } from "./llm/llm.js";

export interface RewrittenQuery {
  nb: string;
  en: string;
}

// No language model is set up
export class QueryRewriteUnavailableError extends Error {}

const SCHEMA: JsonSchema = {
  type: "object",
  properties: { nb: { type: "string" }, en: { type: "string" } },
  required: ["nb", "en"],
};

// The examples are deliberately not products from the evaluation test set,
// so the measurement stays fair
const SYSTEM = `You help importers find goods in the Norwegian customs tariff (Tolltariffen, based on the Harmonized System).

Rewrite the importer's description of a product the way the tariff would describe it:
- Use the tariff's terms for the kind of product, not brand names, marketing words or everyday names.
- Keep the specific product, species, fruit, plant or material by name (the tariff often names them); do not replace it with a broader category.
- Say what the product is and what it is used for, not only what it is made of: the tariff puts a finished article under its kind of article, and its material alone leads to raw materials and sheets.
- Keep every detail that decides classification: material, whether knitted or woven, fresh/chilled/frozen, prepared or not, use, power source, for men/women/children.
- Leave out details that do not matter for classification, such as country of origin, package size and colour.
- Write one short phrase in Norwegian (bokmål), as in the Norwegian tariff, and one in English, as in the English tariff.

Examples:
"Trådløse ørepropper med mikrofon" -> {"nb": "høretelefoner kombinert med mikrofon, trådløse", "en": "earphones combined with a microphone, wireless"}
"Vannkoker i rustfritt stål, 1,7 l" -> {"nb": "elektriske varmtvannskokere til husholdningsbruk", "en": "electric kettles for domestic use"}
"Frosne reker, kokte og pillede" -> {"nb": "reker, kokte og pillede, fryste", "en": "shrimps and prawns, cooked and peeled, frozen"}
"Tursekk i nylon, 40 liter" -> {"nb": "ryggsekker til tur, av nylon", "en": "rucksacks for hiking, of nylon"}

Answer only with JSON: {"nb": "...", "en": "..."}.`;

export async function rewriteQuery(query: string): Promise<RewrittenQuery> {
  const llm = createLlm();
  if (!llm) {
    throw new QueryRewriteUnavailableError("No language model is set up (LLM_PROVIDER in backend/.env)");
  }
  const answer = await generateJsonWithRetry(llm, {
    system: SYSTEM,
    prompt: `Importer's description: ${JSON.stringify(query)}`,
    schema: SCHEMA,
  });
  // Fall back to the original wording if the model returns empty text
  const nb = String(answer.nb).trim() || query;
  const en = String(answer.en).trim() || query;
  return { nb, en };
}
