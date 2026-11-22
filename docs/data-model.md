# Tollvakt data model

Designed from the structure of the real Tolletaten files (download of 2026-11-21).
Implemented in `backend/src/migrations/0002` to `0010`.
Database: PostgreSQL + pgvector. Schema is owned by `backend/` (umzug migrations); the ETL only writes data.

## Conventions

- Table and column names in English, `snake_case`.
- Commodity codes (varenummer) are stored as `char(8)`, HS codes as `varchar(6)`, always as text (leading zeros matter).
- Dates: `valid_from date NOT NULL`, `valid_to date NULL`. An empty `tomdato` in the source means "still valid" and becomes `NULL`.
- Decimal values in the source are strings with a comma (`"24,67"`). They are stored as `numeric(14,4)`, and the original string is kept in a `*_raw` column so nothing is lost if parsing rules change.
- Every import table is replaced as a whole inside one transaction per run (the source files are complete snapshots). The exception is `exchange_rates`, which is upserted so old periods are kept. Each run is logged in `import_runs`.

## Source → table map

| Source file | Table(s) |
|---|---|
| tolltariffstruktur + customstariffstructure | `tariff_nodes`, `tariff_node_references` |
| henvisning + reference | `tariff_references` |
| varenummer | `commodities`, `commodity_classifications` |
| medlemsland | `countries`, `country_group_members` |
| landgruppe | `country_groups` |
| tollavgiftssats, tilleggstollavgiftssats, raavaretollavgiftssats | `duty_rates` |
| ratetradeagreements | `trade_agreement_rates` |
| innfoerselsavgift, utfoerselsavgift | `fees` |
| innfoerselsrestriksjon, utfoerselsrestriksjon | `restrictions` |
| valutakurs | `exchange_rates` |
| (datogyldighetforvare) | not imported: the dataset is currently empty |

---

## 1. Tariff tree

### `tariff_nodes`

One row per element of the tariff tree, in both languages.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| parent_id | int FK → tariff_nodes | NULL for sections |
| node_type | enum | `section`, `chapter`, `subchapter`, `heading`, `subheading`, `group`, `commodity` |
| code | varchar(8) NULL | section `01`, chapter `01`, heading `0101`, commodity `01012100`. NULL for unnumbered groups such as "andre:" |
| hs_code | varchar(6) NULL | `hsNummer` (5 or 6 digits in the source) |
| description_nb | text | `beskrivelse` or `vareslag` |
| description_en | text | `description` or `item` |
| agri_reduction | bool | `blv` / `pap`: raw material duty may be set by Landbruksdirektoratet |
| sort_order | int | position among siblings, keeps the official order |
| depth | int | 0 = section |
| path | text | e.g. `01/01/0101/01012/01012100`, for fast subtree queries |

Mapping of source types:

| Source `type` (nb / en) | node_type |
|---|---|
| avsnitt / section | section |
| kapittel / chapter | chapter |
| inndeling that contains `posisjoner` / `headings` | subchapter |
| posisjon / heading | heading |
| underposisjon / subsubheading | subheading |
| vare / commodity **with** `id` | commodity |
| vare / commodity **without** `id` (only `beskrivelse`, has children) | group |

The Norwegian and English trees have the same shape. The ETL walks both in parallel and fails the run if they differ (different child count or different `id` at the same position).

Indexes: `(code)`, `(hs_code)`, `(parent_id, sort_order)`, `path text_pattern_ops`, full-text index on `description_nb` and `description_en`.

### `tariff_node_references`

| Column | Type | Notes |
|---|---|---|
| node_id | int FK → tariff_nodes | |
| reference_code | varchar FK → tariff_references | e.g. `TKV 031`, `AGRI` |
| PK | (node_id, reference_code) | |

### `tariff_references`

`references` is a reserved word in SQL, so the table has a prefix.

| Column | Type | Notes |
|---|---|---|
| code | varchar PK | `kode` / `code` |
| expression | text | `uttrykk` / `expression` |
| definition_nb_html | text | `definisjon` (HTML) |
| definition_en_html | text | `definition` (HTML) |

### `tariff_notes` (empty in v1, filled from the tariff PDF)

Section and chapter notes plus the general interpretation rules. Not in the open data; see the open questions in the README.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| node_id | int FK → tariff_nodes NULL | NULL for the general interpretation rules |
| note_kind | enum | `general_rule`, `section_note`, `chapter_note`, `subheading_note`, `additional_note` |
| note_number | varchar | e.g. `1`, `2 a` |
| text_nb | text | |
| text_en | text NULL | |
| tariff_year | int | |
| source | text | document and page reference |

---

## 2. Commodity codes

### `commodities`

| Column | Type | Notes |
|---|---|---|
| code | char(8) PK | `id` |
| node_id | int FK → tariff_nodes NULL | the matching commodity leaf in the tree |
| unit | varchar | `enhet`, e.g. `KG` |
| unit_description | text | |
| secondary_unit | varchar NULL | `annenEnhet`, e.g. `STK` |
| secondary_unit_description | text NULL | |
| valid_from | date | |
| valid_to | date NULL | |
| season_from | char(4) | `fomperiode` (MMDD), seasonal codes |
| season_to | char(4) | `tomperiode` (MMDD) |

### `commodity_classifications`

| Column | Type | Notes |
|---|---|---|
| commodity_code | char(8) FK → commodities | |
| code | varchar | e.g. `NA` = næringsmiddel (food: 15 % VAT) |
| description | text | |
| valid_from | date | |
| valid_to | date NULL | |

---

## 3. Countries and country groups

### `countries`

| Column | Type | Notes |
|---|---|---|
| code | char(2) PK | ISO code, `landkode` |
| name_nb | text | `landnavn` |

### `country_groups`

| Column | Type | Notes |
|---|---|---|
| code | varchar PK | `landgruppekode`, e.g. `TALL`, `EU`, `RALL` |
| name_nb | text | |
| preference_code | varchar | `preferansekode` |
| valid_from | date | |
| valid_to | date NULL | |

### `country_group_members`

| Column | Type | Notes |
|---|---|---|
| country_code | char(2) FK → countries | |
| group_code | varchar FK → country_groups | |
| valid_from | date | |
| valid_to | date NULL | |
| PK | (country_code, group_code, valid_from) | |

"Which rates apply to goods from country X on date D" = the groups X belongs to on date D, joined with the rates of those groups valid on D.

---

## 4. Duty rates

### `duty_rates`

One table for ordinary customs duty, additional customs duty and raw material duty; they share the same source shape.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| commodity_code | char(8) | not a hard FK: rate files may contain codes missing from `commodities` (reported by validation) |
| duty_kind | enum | `customs` (tollavgiftssats), `additional` (tilleggstollavgiftssats), `raw_material` (raavaretollavgiftssats) |
| country_group_code | varchar FK → country_groups | `landgruppe` |
| measure_unit | varchar | `enhet` of the commodity in the rate file |
| measure_secondary_unit | varchar NULL | `annenEnhet` |
| rate_unit | varchar NULL | `satsEnhet`, e.g. `P` (percent of value), `K` (per kg); NULL if blank |
| rate_unit_description | text NULL | |
| rate_value | numeric(14,4) NULL | parsed `satsVerdi` |
| rate_raw | varchar | original `satsVerdi` |
| is_special_value | bool | true for placeholder values such as `999999,99`; never used in calculations until their meaning is confirmed |
| valid_from | date | |
| valid_to | date NULL | |

Indexes: `(commodity_code, duty_kind, country_group_code, valid_from)`.

### `trade_agreement_rates`

English snapshot of current free trade agreement rates (`ratetradeagreements`). Used to cross-check `duty_rates`; `duty_rates` is the master because it is dated and complete.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| commodity_code | char(8) | |
| agreement_codes | text[] | `landCodes`, e.g. `{EU}` |
| value | numeric(14,4) NULL | `customDuty.value` |
| value_type | varchar NULL | `customDuty.type`, e.g. `pr.item` |
| classifier | varchar | `customDuty.classifier`, e.g. `FREE` |

---

## 5. Other fees (import and export)

### `fees`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| direction | enum | `import`, `export` |
| commodity_code | char(8) | |
| country_group_code | varchar | e.g. `ALLE`, `UALL` |
| fee_type | varchar | `avgiftstype`, e.g. `MV` (VAT), `FF` (fish export fee) |
| fee_type_description | text | |
| fee_group | int | `avgiftsgruppe` |
| fee_group_description | text | |
| rate_value | numeric(14,4) NULL | parsed `sats` |
| rate_raw | varchar | |
| is_ore_rate | bool | `oresats` ("true"/"false"/null in the source) |
| rate_unit | varchar | `enhet`, e.g. `P` |
| rate_unit_description | text | |
| valid_from | date | |
| valid_to | date NULL | |

---

## 6. Restrictions (import and export)

### `restrictions`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| direction | enum | `import`, `export` |
| commodity_code | char(8) | |
| country_group_code | varchar | e.g. `RALL`, `XALL` |
| applies_to | varchar NULL | `gjelder`: `avsenderland` / origin country (import only) |
| restriction_type | varchar | e.g. `V5` |
| restriction_type_description | text | e.g. "Veterinæravtalen" |
| restriction_group | int | |
| restriction_group_description | text | e.g. "Varsel Mattilsynet" |
| valid_from | date | |
| valid_to | date NULL | |

---

## 7. Exchange rates

### `exchange_rates`

| Column | Type | Notes |
|---|---|---|
| currency_code | char(3) | |
| description | text | |
| rate | numeric(14,6) | NOK per `unit` units of currency |
| rate_raw | varchar | |
| unit | int | `omregningsenhet` |
| valid_from | date | |
| valid_to | date NULL | NOK has a fixed rate without an end date (migration 0011) |
| PK | (currency_code, valid_from) | kept over time, so old calculations stay reproducible |

---

## 8. Destination countries (phase 2: EU, UK, USA)

### `destination_tariff_lines`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| destination | enum | `EU`, `UK`, `US` |
| code | varchar(12) | national code (EU 10, UK 10, US 10 digits) |
| hs_code | varchar(6) | link to Norwegian codes |
| description | text | |
| valid_from | date | |
| valid_to | date NULL | |

### `destination_duty_rates`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| line_id | bigint FK → destination_tariff_lines | |
| origin | varchar | `ERGA_OMNES`, `NO`, or an agreement code |
| rate_type | enum | `ad_valorem`, `specific`, `compound`, `free` |
| ad_valorem_percent | numeric(8,4) NULL | |
| specific_amount | numeric(14,4) NULL | |
| specific_currency | char(3) NULL | |
| specific_unit | varchar NULL | e.g. `kg`, `item` |
| minimum_amount | numeric(14,4) NULL | |
| maximum_amount | numeric(14,4) NULL | |
| rate_raw | text | original text |
| valid_from | date | |
| valid_to | date NULL | |

---

## 9. AI retrieval

Semantic search compares a vector of the user's description with vectors of the tariff texts (pgvector, migration 0013). Vectors come from an embedding model: locally Ollama with `embeddinggemma`, in production the Gemini API with `gemini-embedding-001`. Both give 768 dimensions, the size fixed by the column type.

Vectors are stored per **text**, not per tree node. Node ids change on every import, but most texts do not: the ETL (`python -m tollvakt_etl.embed_norway`) sends only texts without a vector for the current model, so re-importing an unchanged tariff costs nothing, and a stopped run continues where it stopped. Afterwards it removes the model's vectors whose text no node has any more.

What is embedded: the embedding text (`embedding_text_nb`, `embedding_text_en`) of every commodity node, in both languages: the code's own text first, then the levels above it, nearest first, up to the chapter (`koffeinholdig < brent kaffe < Kaffe, også brent … < Kaffe, te, maté og krydderier`). Section titles are left out. A code's own text is often short ("koffeinholdig", "ellers"); with the path written from the section down, the long general titles decided the vector and close codes could not be told apart (migration 0014; 0013 embedded the search text). A query is compared with both languages, and the nearer one counts.

### `tariff_nodes` (added by migrations 0013 and 0014)

| Column | Type | Notes |
|---|---|---|
| embedding_text_nb | text | own text first, then the levels above up to the chapter (ETL) |
| embedding_text_en | text | |
| embedding_hash_nb | char(32) | generated: `md5(embedding_text_nb)`; links the node to its vector |
| embedding_hash_en | char(32) | generated: `md5(embedding_text_en)` |

### `text_embeddings`

| Column | Type | Notes |
|---|---|---|
| model | varchar(100) | provider and model, e.g. `ollama:embeddinggemma`, `gemini:gemini-embedding-001` |
| text_hash | char(32) | md5 of the embedded text |
| embedding | vector(768) | HNSW index for cosine distance |
| created_at | timestamptz | |
| PK | (model, text_hash) | |

Vectors from different models cannot be compared, so the model is part of the key and the backend searches only its own model's vectors. One model per database is expected; while switching, both models' vectors can be kept until the new run is complete.

The same table will hold vectors for BKU rulings (keyed by the hash of their text) once that data is available.

### `bku_rulings` (empty until the data is available)

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| reference | varchar UNIQUE | ruling number |
| commodity_code | char(8) | |
| description | text | goods description |
| justification | text NULL | |
| decided_at | date | |
| valid_to | date NULL | |
| source_url | text | |


---

## 10. Import bookkeeping

### `import_runs`

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| source | varchar | e.g. `norway` |
| started_at | timestamptz | |
| finished_at | timestamptz NULL | |
| status | enum | `running`, `succeeded`, `failed` |
| manifest | jsonb | the download manifest (URLs, dates, sha256) |
| row_counts | jsonb | rows written per table |
| validation_report | jsonb | warnings and errors |
| error | text NULL | |

---

## Validation rules (run before any write)

1. Norwegian and English trees have identical shape.
2. Every commodity leaf in the tree exists in `commodities`, and the reverse; differences are reported (today: 7 445 codes in `varenummer`, 7 440 in the rate files).
3. Every `country_group_code` used in rates, fees and restrictions exists in `country_groups`.
4. Every reference code in the tree exists in `tariff_references`.
5. All numeric strings parse; values like `999999,99` are flagged `is_special_value`.
6. Row counts do not drop by more than 5 % compared to the previous successful run (protects against a broken or partial file).
7. Reference products: a fixed list of known codes whose duty and VAT must match expected values (e.g. Tolletaten's own calculation examples).

## Open points

- Meaning of the placeholder rate `999999,99` and of a blank `satsEnhet`: check against `tariff_references` (e.g. `AGRI`) and Tolletaten's tariff before using in calculations.
