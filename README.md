# Tollvakt

[![CI](https://github.com/devrimsavas/TOLLVAKT/actions/workflows/ci.yml/badge.svg)](https://github.com/devrimsavas/TOLLVAKT/actions/workflows/ci.yml)

**AI-assisted customs classification and duty estimation for Norwegian importers and exporters.**

Tollvakt helps small Norwegian businesses find the right commodity code (varenummer), estimate customs duty and VAT, and check whether a free trade agreement can lower the duty, before the goods reach the border.

> Status: in development. Norwegian data import, duty calculation, commodity search and AI classification are working in the backend, with accounts, daily quotas and saved classifications. The frontend is next.

---

## The problem

- Every imported or exported item needs the correct commodity code. Duty rates, VAT basis and import/export requirements all depend on it.
- If Tolletaten finds a wrong code in an audit and too little duty was paid, the difference is reassessed afterwards (etterberegning).
- Tolletaten's own tariff search is a starting point, not a final answer: section, chapter and subheading notes must still be checked by hand.
- From **1 March 2027**, customs declarations must be submitted at the latest at the border crossing (Digitoll), and the direct-driving arrangement (direktekjøring) ends. Importers need correct goods data, including the commodity code, _before_ the goods arrive.
- Exporters need to know what their buyer will pay in the destination country, and which proof of origin unlocks preferential duty.

## Target users

1. **Norwegian importers**: small businesses and e-commerce shops importing from outside the EU (e.g. China, USA, Türkiye), where duty actually applies.
2. **Norwegian exporters**: businesses selling to the EU, the UK and the USA who need the Norwegian export code and the duty their buyer will pay.
3. **Small freight forwarders / customs representatives**: who classify goods for many clients (possible later segment).

## What it does (v1 scope)

1. User describes a product in **Norwegian or English** (free text).
2. Tollvakt suggests the **top 3 Norwegian commodity codes** with reasoning, based on the tariff structure, tariff notes and similar published binding classification rulings (BKU).
3. For the chosen code it calculates:
   - general and preferential duty rate (Norway)
   - estimated duty and import VAT for a given value, freight and insurance
   - whether a free trade agreement applies and what proof of origin is needed
4. For exports: the duty in the **destination country** (EU, UK, USA), based on the 6-digit HS code.
5. Every result links to the official sources and to Tolletaten's BKU application. Tollvakt gives **suggestions, not binding decisions**.

## Countries (first wave)

| Country        | Role                   | Data source                                                         |
| -------------- | ---------------------- | ------------------------------------------------------------------- |
| Norway         | Import + export (base) | Tolletaten open data (tariff structure, duty rates, exchange rates) |
| EU (27)        | Export destination     | EU TARIC (free Excel download)                                      |
| United Kingdom | Export destination     | GOV.UK Trade Tariff API                                             |
| USA            | Export destination     | USITC HTS REST API                                                  |

Why these: based on Statistics Norway trade data for 2025, the EU and the UK together take the large majority of Norway's exports among the top 10 partners, and Germany, Sweden and the USA are among the largest import sources. Imports from any origin (including China and Türkiye) are covered by the Norwegian tariff and Norway's free trade agreements; no foreign tariff data is needed for imports.

Later candidates: other destination countries only when customers ask for them.

## Design principles

- **The AI understands and chooses; code calculates.** The LLM only sees a short list of candidate codes and notes, and picks with reasoning. All duty, VAT and amount calculations are deterministic code, never LLM output.
- **Sources are always shown.** Every suggestion cites the tariff notes and BKU rulings it is based on.
- **Official data only.** Open public data under NLOD / CC BY 4.0 / equivalent licences, with sources credited as required.
- **One common tariff model.** All countries are normalised into one data model that supports ad valorem, specific (per kg/unit), compound and minimum duties, origin-dependent rates and validity dates.

## Architecture

```
                ┌──────────────────────┐
                │  frontend/ (Next.js) │  nb / en UI
                └──────────┬───────────┘
                           │ REST
                ┌──────────▼───────────┐
                │  backend/ (Express + │  auth, classification flow,
                │  TypeScript)         │  duty calculation, LLM calls
                └──────────┬───────────┘
                           │
                ┌──────────▼───────────┐
                │  PostgreSQL          │  tariffs, rates, notes, BKU,
                │  + pgvector          │  embeddings, users, history
                └──────────▲───────────┘
                           │ writes
                ┌──────────┴───────────┐
                │  etl/ (Python +      │  scheduled import + normalisation
                │  pandas)             │  per country, validation
                └──────────────────────┘
```

- **backend/**: Express + TypeScript (ESM), sequelize-typescript models, umzug migrations, JWT auth, Swagger. Same conventions as Leverandørvakt and Regelvakt.
- **etl/**: Python microservice with pandas. One importer per source, all writing to the common tariff model. Scheduled updates and validation against known reference products.
- **frontend/**: Next.js, Digdir Designsystemet, dark mode, Norwegian / English.
- **LLM**: provider-agnostic; Ollama locally, Gemini in production. Model-backed calls have daily quotas (guests, members and a global cap), so the cost of a day has a ceiling.
- **Hosting**: netcup VPS + Docker Compose + Cloudflare Tunnel (`tollvakt.devrimdev.no`).

## Classification flow

1. Normalise the product description (Norwegian or English).
2. Retrieve candidates: semantic search (pgvector) + full-text search over tariff texts, notes and BKU rulings.
3. LLM selects the top 3 codes from the candidates and explains why, citing notes and rulings.
4. Code calculates duty, VAT and preferential options for the selected code.
5. Result is stored in the user's history for later reference.

## Open questions

- [ ] Is the BKU ruling archive available as a downloadable dataset or API, or only through the web search? (Critical for classification quality.)
- [ ] Who pays: importers directly, or freight forwarders as a tool for their clients? (To be validated with real users.)
- [ ] Total LLM cost per classification, measured during the pilot.

## Roadmap

### Phase 0: Foundation
- [x] Repository and README
- [ ] Licence
- [x] Common tariff data model (design + migrations)
- [x] Backend skeleton (Express + TypeScript, auth, Swagger) reusing Leverandørvakt/Regelvakt patterns
- [x] CI on GitHub Actions (backend and ETL tests against PostgreSQL)

### Phase 1: Norway
- [x] ETL: Tolletaten tariff structure, duty rates, fees, restrictions, exchange rates
- [ ] ETL: BKU rulings (not available as open data; asked Tolletaten)
- [x] Duty + VAT calculator
- [ ] Duty + VAT calculator checked against Tolletaten's own calculation examples
- [x] Free-trade-agreement check (preferential vs. ordinary rate, possible saving)
- [ ] Proof-of-origin guidance
- [x] Commodity search: full-text (nb/en) and code search
- [x] Semantic search (pgvector; Ollama locally, Gemini in production)
- [x] Query rewriting into the tariff's wording (LLM) and hybrid search (full-text + semantic, rank fusion)
- [x] Accuracy test sets: a tuning set and a held-out set of products with known correct codes
- [x] Classification flow (retrieval + LLM + reasoning, top 3 codes, confidence, questions to the user)
- [ ] Section and chapter notes extracted from the tariff PDF

### Phase 1b: Accounts and usage
- [x] Daily quotas for model-backed calls: guests (by hashed IP), members, global cap
- [x] Saved classifications: members see, print and delete their own
- [x] Admin endpoints: users, daily limits, closing accounts, usage statistics
- [x] Account: change password, delete account, data export (GDPR), language, password reset by email

### Phase 2: Export destinations
- [ ] ETL: EU TARIC
- [ ] ETL: UK Trade Tariff API
- [ ] ETL: USA (USITC HTS API)
- [ ] Destination duty lookup via 6-digit HS mapping

### Phase 3: Frontend and pilot
- [ ] Next.js UI (nb / en)
- [ ] "Free customs check" demo for pilot users
- [ ] Deployment to production
- [ ] Pilot with Norwegian importers and exporters

### Later
- [ ] Batch classification (CSV upload of product lists)
- [ ] Change alerts when a rate for a saved code changes
- [ ] API for freight forwarders

## Disclaimer

Tollvakt provides suggestions based on public data. It is not a binding classification. For legal certainty, apply for a binding classification ruling (BKU) from Tolletaten, which is free of charge.

## Data sources and licences

- Tolletaten open data (NLOD / CC BY 4.0), source: Tolletaten
- EU TARIC, European Commission
- GOV.UK Trade Tariff (Open Government Licence v3.0)
- USITC Harmonized Tariff Schedule (public domain)
