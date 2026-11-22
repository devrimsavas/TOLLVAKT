// Inserts a small, realistic piece of Tolletaten's data for API tests.
import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/config/database.js";
import { fakeEmbedding } from "../../src/services/embeddings/embedder.js";

export async function seedTariffData(): Promise<void> {
  await sequelize.query(`
    INSERT INTO country_groups (code, name_nb, preference_code, valid_from) VALUES
      ('TALL', 'Toll fra alle land (ordinær toll)', 'N', '1990-01-01'),
      ('TTYR', 'Toll fra Tyrkia', 'P', '1990-01-01'),
      ('TEF', 'Toll fra EU- land', 'B', '1990-01-01'),
      ('RALL', 'Restriksjon fra alle land', 'N', '1990-01-01'),
      ('ALLE', 'Avgift fra alle land', 'N', '1990-01-01');
    INSERT INTO countries (code, name_nb) VALUES ('TR', 'Tyrkia'), ('DE', 'Tyskland'), ('CN', 'Kina'),
      ('XB', 'Kanariøyene');
    INSERT INTO country_group_members (country_code, group_code, valid_from) VALUES
      ('TR', 'TTYR', '1992-04-17'), ('DE', 'TEF', '1990-01-01');

    INSERT INTO tariff_nodes (id, parent_id, node_type, code, description_nb, description_en, search_text_nb, search_text_en, sort_order, depth, path) VALUES
      (1, NULL, 'section', '11', 'Tekstilmaterialer og varer derav', 'Textiles and textile articles',
        'Tekstilmaterialer og varer derav', 'Textiles and textile articles', 0, 0, '11'),
      (2, 1, 'heading', '6109', 'T-skjorter, singleter og andre undertrøyer, av trikotasje.', 'T-shirts, singlets and other vests, knitted or crocheted.',
        'Tekstilmaterialer og varer derav > T-skjorter, singleter og andre undertrøyer, av trikotasje.',
        'Textiles and textile articles > T-shirts, singlets and other vests, knitted or crocheted.', 0, 1, '11/6109'),
      (3, 2, 'commodity', '61091000', 'av bomull', 'Of cotton',
        'Tekstilmaterialer og varer derav > T-skjorter, singleter og andre undertrøyer, av trikotasje. > av bomull',
        'Textiles and textile articles > T-shirts, singlets and other vests, knitted or crocheted. > Of cotton', 0, 2, '11/6109/61091000'),
      (5, 2, 'commodity', '61099000', 'av andre tekstilmaterialer', 'Of other textile materials',
        'Tekstilmaterialer og varer derav > T-skjorter, singleter og andre undertrøyer, av trikotasje. > av andre tekstilmaterialer',
        'Textiles and textile articles > T-shirts, singlets and other vests, knitted or crocheted. > Of other textile materials', 1, 2, '11/6109/61099000'),
      (4, NULL, 'commodity', '02011000', 'hele og halve skrotter', 'Carcasses and half-carcasses',
        'hele og halve skrotter', 'Carcasses and half-carcasses', 1, 0, '02011000');
    INSERT INTO commodities (code, node_id, unit, valid_from, valid_to, season_from, season_to) VALUES
      ('61091000', 3, 'KG', '1988-01-01', NULL, '0101', '1231'),
      ('61099000', 5, 'KG', '1988-01-01', '2020-12-31', '0101', '1231'),
      ('02011000', 4, 'KG', '1988-01-01', NULL, '0101', '1231');
    -- Own text first, then the levels above up to the chapter (no section), as the ETL builds it
    UPDATE tariff_nodes SET
      embedding_text_nb = CASE id
        WHEN 2 THEN 'T-skjorter, singleter og andre undertrøyer, av trikotasje.'
        WHEN 3 THEN 'av bomull < T-skjorter, singleter og andre undertrøyer, av trikotasje.'
        WHEN 5 THEN 'av andre tekstilmaterialer < T-skjorter, singleter og andre undertrøyer, av trikotasje.'
        WHEN 4 THEN 'hele og halve skrotter' END,
      embedding_text_en = CASE id
        WHEN 2 THEN 'T-shirts, singlets and other vests, knitted or crocheted.'
        WHEN 3 THEN 'Of cotton < T-shirts, singlets and other vests, knitted or crocheted.'
        WHEN 5 THEN 'Of other textile materials < T-shirts, singlets and other vests, knitted or crocheted.'
        WHEN 4 THEN 'Carcasses and half-carcasses' END
    WHERE id IN (2, 3, 4, 5);
    INSERT INTO tariff_references (code, expression, definition_nb_html, definition_en_html) VALUES
      ('TKV 061', 'Trikotasje', '<p>Varer av trikotasje</p>', '<p>Knitted goods</p>');
    INSERT INTO tariff_node_references (node_id, reference_code) VALUES (2, 'TKV 061');
    INSERT INTO commodity_classifications (commodity_code, code, description, valid_from) VALUES
      ('02011000', 'NA', 'Næringsmiddel', '2020-01-01');

    INSERT INTO duty_rates (commodity_code, duty_kind, country_group_code, rate_unit, rate_value, rate_raw, valid_from, valid_to) VALUES
      ('61091000', 'customs', 'TALL', 'P', 10.7, '10,70', '2004-01-01', NULL),
      ('61091000', 'customs', 'TTYR', 'P', 0, '0,00', '1996-01-01', NULL),
      ('61091000', 'customs', 'TEF', 'P', 0, '0,00', '1996-01-01', NULL),
      ('02011000', 'customs', 'TALL', 'K', 12, '12,00', '2026-11-03', '2026-11-30'),
      ('02011000', 'customs', 'TALL', 'K', 32.28, '32,28', '2026-12-01', NULL);

    INSERT INTO fees (direction, commodity_code, country_group_code, fee_type, fee_group, fee_group_description, rate_value, rate_raw, rate_unit, valid_from) VALUES
      ('import', '61091000', 'ALLE', 'MV', 1, 'Merverdiavgift', 25, '25,00', 'P', '2005-01-01'),
      ('import', '02011000', 'ALLE', 'MV', 1, 'Merverdiavgift', 25, '25,00', 'P', '2005-01-01'),
      ('import', '02011000', 'ALLE', 'MV', 2, 'Merverdiavgift lav sats', 15, '15,00', 'P', '2012-01-01');

    INSERT INTO restrictions (direction, commodity_code, country_group_code, applies_to, restriction_type, restriction_type_description, valid_from) VALUES
      ('import', '02011000', 'RALL', 'avsenderland', 'V5', 'Veterinæravtalen', '2012-01-01');

    INSERT INTO exchange_rates (currency_code, valid_from, valid_to, description, rate, rate_raw, unit) VALUES
      ('EUR', '2026-11-12', '2026-11-25', 'EURO', 10.454, '10,454', 1),
      ('EUR', '2026-11-26', '2026-12-09', 'EURO', 10.532, '10,532', 1);
  `);
}

// Stores a vector for each commodity's embedding texts, as the ETL does,
// with the tests' fake model
export async function seedEmbeddings(): Promise<void> {
  const rows = await sequelize.query<{ hash: string; text: string }>(
    `SELECT embedding_hash_nb AS hash, embedding_text_nb AS text FROM tariff_nodes
      WHERE node_type = 'commodity' AND embedding_text_nb IS NOT NULL
     UNION
     SELECT embedding_hash_en, embedding_text_en FROM tariff_nodes
      WHERE node_type = 'commodity' AND embedding_text_en IS NOT NULL`,
    { type: QueryTypes.SELECT },
  );
  for (const row of rows) {
    await sequelize.query(
      "INSERT INTO text_embeddings (model, text_hash, embedding) VALUES ('fake', :hash, CAST(:vector AS vector))",
      { replacements: { hash: row.hash, vector: `[${fakeEmbedding(row.text).join(",")}]` } },
    );
  }
}
