---
name: master-data-management
description: Comprehensive skill for materials, classifications, vendor masters, MPN catalogs, and standard pricing taxonomies.
---

# Master Data Management (MDM) Skill

## Overview
Equips AI agents to query, standardize, validate, and manage ERP Master Data with 100% taxonomic consistency.

## Capabilities & Tools
1. `validate_material_code`: Generates and verifies unique SKU codes (`RM-XXX`, `FG-XXX`, `PKG-XXX`).
2. `standardize_taxonomy`: Categorizes items into hierarchical classifications (Metals > Ferrous > Steel).
3. `vendor_onboarding_check`: Validates GSTIN, PAN, bank details, and compliance records.
4. `mpn_price_variance`: Evaluates supplier part pricing variance against base price standards.
5. `duplicate_sku_detection`: Identifies phonetic and token overlaps in material names.
6. `uom_conversion`: Converts units across metric, packaging, and custom volumetric measurements.
7. `vendor_tier_rating`: Computes supplier reliability and lead-time adherence scores.
8. `hsn_sac_validation`: Validates Indian taxation and commodity codes.
9. `lifecycle_status_guard`: Enforces soft deactivation over hard deletion on master entities.
10. `bulk_import_reconciliation`: Parses CSV/Excel catalog uploads with schema validation.
