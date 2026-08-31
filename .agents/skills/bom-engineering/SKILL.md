---
name: bom-engineering
description: Skill for multi-level BOM explosion, recipe cost rollup, scrap factor modeling, component substitution, and batch scaling.
---

# Bill of Materials (BOM) & Engineering Skill

## Overview
Equips AI agents to analyze manufacturing recipes, calculate batch requirements, perform cost rollups, and optimize scrap percentages.

## Capabilities & Tools
1. `bom_explosion_engine`: Recursively decomposes finished assemblies into raw sub-components.
2. `recipe_cost_rollup`: Calculates standard unit cost from linked MPN part prices and quantities.
3. `scrap_percentage_optimizer`: Models yield loss and recommends buffer tolerances.
4. `batch_scaling_calculator`: Linearly scales raw material inputs for variable batch lot sizes.
5. `component_substitution_finder`: Identifies functionally equivalent MPN alternatives.
6. `circular_dependency_check`: Prevents recursive circular references in sub-assembly definitions.
7. `bom_versioning_manager`: Tracks revision history and effective engineering change dates.
8. `uom_bom_aligner`: Ensures recipe component units match stock keeping units.
9. `cost_breakdown_visualizer`: Generates percentage pie contributions of raw materials to BOM cost.
10. `draft_bom_payload`: Formats validated recipe creation payloads for human-in-the-loop approval.
