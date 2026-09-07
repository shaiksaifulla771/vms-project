/**
 * generate_classification_excel.js
 * Generates the definitive 5-tab MS Excel Workbook:
 * "reports/Material_and_Vendor_Classification_Master.xlsx"
 * Demonstrating complete Material and Vendor Classification taxonomies,
 * Master Data relationships, compliance gates, and ERP/VMS workflows.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../../reports');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
const outputPath = path.join(outputDir, 'Material_and_Vendor_Classification_Master.xlsx');

// -------------------------------------------------------------
// SHEET 1: Executive Overview & System Architecture
// -------------------------------------------------------------
const overviewData = [
  ['VMS & ERP CLASSIFICATION SYSTEM - EXECUTIVE ARCHITECTURE BLUEPRINT', '', '', ''],
  ['Document Version', '1.0.0', 'Generated Date', new Date().toISOString().split('T')[0]],
  ['System Scope', 'Vendor Management System (VMS) & Enterprise Resource Planning (ERP)', 'Author', 'Antigravity Multi-Agent Engineering Architecture'],
  [],
  ['SECTION', 'CORE QUESTION / TOPIC', 'ARCHITECTURAL RATIONALE & ENTERPRISE LOGIC', 'OPERATIONAL IMPACT IN VMS/ERP'],
  [
    '1. Sub-Module Decoupling',
    'Why did we create BOTH Material Classification and Vendor Classification?',
    'Materials and Vendors represent two fundamentally different sides of the supply chain equation: "What we buy, store, transform, and sell" (Physical Items) vs. "Who we legally contract, evaluate, and pay" (Commercial Counterparties). Decoupling them enables many-to-many relationships without duplicating schema fields.',
    'Allows one vendor to supply multiple material classes (e.g. fresh fruits and packaging), and allows one material SKU to be multi-sourced across different vendor tiers without data redundancy or vendor lock-in.'
  ],
  [
    '2. Role in VMS',
    'What is the specific use and business value in the VMS project?',
    'In a manufacturing plant or commercial facility, a Vendor is not just an accounting record; their representatives, delivery truckers, quality auditors, and contractors physically arrive at the facility gate.',
    'Drives automated gate security clearances, visitor badge types, safety induction protocols, loading dock routing (e.g. food ingredients vs packaging), and emergency evacuation zone tracking.'
  ],
  [
    '3. Master Data Link',
    'What is the link between Master Data and Classifications?',
    'Master Data stores individual atomic instances (SKU-1001, Vendor-205). Classifications provide the hierarchical taxonomy, policy inheritance templates, accounting GL mappings, and governance rules.',
    'Provides normalized foreign key relationships (categoryId). Eliminates unstructured text inconsistencies, enables cascading policy updates, and provides single-point taxonomy governance.'
  ],
  [
    '4. Why Classifications Are Needed',
    'Why do we need classifications instead of flat category strings?',
    'Flat strings ("Raw", "raw material", "RM") cause duplicate SKUs, broken queries, impossible spend rollups, and inability to integrate with global ERP standards like UNSPSC and SAP Material Groups.',
    'Enforces automated Quality Inspection rules (AQL sampling, microbial tests for food vs dimensional checks for cartons), mandatory compliance (FSSAI/FFSC 22000), and 3-way invoice matching constraints.'
  ],
  [
    '5. Operational Workflow',
    'What is the end-to-end logic and transaction workflow?',
    'Classification Governance -> Master Data Enrollment -> Demand Planning (MRP) -> PO Auto-Allocation -> VMS Gate Entry & Badge -> GRN Inwarding -> QC Testing Gate -> Stock Ledger -> 3-Way Match & Payment Release.',
    'Ensures 100% trace-forward and trace-backward auditability across every purchase, shipment, quality certificate, and inventory movement.'
  ],
  [],
  ['SUMMARY GLOSSARY OF TERMS', '', '', ''],
  ['Term / Acronym', 'Full Name', 'Definition & Purpose in VMS/ERP', ''],
  ['UNSPSC', 'United Nations Standard Products and Services Code', 'Global four-level taxonomy hierarchy (Segment > Family > Class > Commodity) for spend analysis.', ''],
  ['VMS', 'Vendor Management System', 'Platform governing vendor onboarding, compliance, visitor passes, contracts, and delivery receipts.', ''],
  ['MDM', 'Master Data Management', 'Discipline of defining and managing critical enterprise data entities (Materials, Vendors, Warehouses).', ''],
  ['BOM', 'Bill of Materials', 'Multi-level recipe structure linking raw components and packaging to finished goods.', ''],
  ['MRP', 'Material Requirements Planning', 'Algorithmic calculation of gross-to-net material demands based on production plans and lead times.', ''],
  ['GRN', 'Goods Receipt Note', 'Official receiving document generated at the loading dock upon physical shipment delivery.', ''],
  ['QC Gate', 'Quality Control Gate', 'Mandatory inspection checkpoint testing incoming batches before releasing into active inventory.', ''],
  ['FSSAI', 'Food Safety and Standards Authority of India', 'Mandatory statutory food hygiene and safety licensing standard for food processors.', ''],
  ['FFSC 22000', 'Food Safety System Certification 22000', 'Global ISO-based food safety management standard for ingredients, packaging, and manufacturing.', '']
];

// -------------------------------------------------------------
// SHEET 2: Material Classification Master
// -------------------------------------------------------------
const materialClassData = [
  ['MATERIAL CLASSIFICATION TAXONOMY MASTER', '', '', '', '', '', '', '', '', '', '', ''],
  ['Hierarchical taxonomy tree for all raw components, packaging, semi-finished assemblies, and finished products.', '', '', '', '', '', '', '', '', '', '', ''],
  [],
  [
    'Class Code',
    'Category (Level 0)',
    'Sub-Category (Level 1)',
    'Commodity Family (Level 2)',
    'Full Hierarchy Path',
    'Parent Code',
    'Material Type',
    'Default Storage Condition',
    'QC Inspection Protocol',
    'Standard Tax / HSN Group',
    'Lead Time Baseline (Days)',
    'Status'
  ],
  // Level 0: Raw Materials
  ['RAW', 'Raw Material', '', '', 'Raw Material', 'ROOT', 'Raw Material', 'Various', 'Standard Incoming Inspection', 'HSN-0800', 7, 'Active'],
  ['RAW-AGR', 'Raw Material', 'Fresh Agricultural', '', 'Raw Material › Fresh Agricultural', 'RAW', 'Raw Material', 'Cold Storage (2-6°C)', 'AQL 1.0 + Brix + Moisture + Pesticide Residue', 'HSN-0804', 3, 'Active'],
  ['RAW-AGR-FRT', 'Raw Material', 'Fresh Agricultural', 'Fruits & Berries', 'Raw Material › Fresh Agricultural › Fruits & Berries', 'RAW-AGR', 'Raw Material', 'Cold Storage (2-4°C)', 'Organoleptic + Firmness + Brix + Visual Rot', 'HSN-0804', 2, 'Active'],
  ['RAW-AGR-VEG', 'Raw Material', 'Fresh Agricultural', 'Vegetables & Tubers', 'Raw Material › Fresh Agricultural › Vegetables & Tubers', 'RAW-AGR', 'Raw Material', 'Cold Storage (4-8°C)', 'Dirt Tolerance + Size Grading + Microbial Count', 'HSN-0701', 3, 'Active'],
  ['RAW-GRN', 'Raw Material', 'Grains & Cereals', '', 'Raw Material › Grains & Cereals', 'RAW', 'Raw Material', 'Dry & Ambient (<25°C, <60% RH)', 'Moisture Content (<12%) + Foreign Matter + Weevils', 'HSN-1008', 14, 'Active'],
  ['RAW-GRN-MIL', 'Raw Material', 'Grains & Cereals', 'Millets & Sorghum', 'Raw Material › Grains & Cereals › Millets & Sorghum', 'RAW-GRN', 'Raw Material', 'Dry & Ambient (<25°C)', 'Gluten Free Verification + Moisture (<11%)', 'HSN-1008', 14, 'Active'],
  ['RAW-GRN-PUL', 'Raw Material', 'Grains & Cereals', 'Pulses & Lentils', 'Raw Material › Grains & Cereals › Pulses & Lentils', 'RAW-GRN', 'Raw Material', 'Dry & Ambient (<25°C)', 'Foreign Seed Screening + Protein Analysis', 'HSN-0713', 10, 'Active'],
  ['RAW-GRN-OAT', 'Raw Material', 'Grains & Cereals', 'Oats & Flakes', 'Raw Material › Grains & Cereals › Oats & Flakes', 'RAW-GRN', 'Raw Material', 'Cool & Dry (<20°C)', 'Enzyme Activity + Peroxide Value + Flake Thickness', 'HSN-1104', 21, 'Active'],
  ['RAW-DAI', 'Raw Material', 'Dairy & Cultures', '', 'Raw Material › Dairy & Cultures', 'RAW', 'Raw Material', 'Cold Storage (2-4°C)', 'Total Bacterial Count + Antibiotic Residue + pH', 'HSN-0402', 5, 'Active'],
  ['RAW-DAI-YOG', 'Raw Material', 'Dairy & Cultures', 'Yogurt Cultures & Powders', 'Raw Material › Dairy & Cultures › Yogurt Cultures', 'RAW-DAI', 'Raw Material', 'Deep Freeze (-18°C)', 'Viable Probiotic CFU Count + Pathogen Negative', 'HSN-0403', 10, 'Active'],
  ['RAW-NUT', 'Raw Material', 'Nutritional Additives', '', 'Raw Material › Nutritional Additives', 'RAW', 'Raw Material', 'Air Conditioned (<22°C)', 'HPLC Assay + Heavy Metal Screen + Certificate of Analysis', 'HSN-2106', 30, 'Active'],

  // Level 0: Packaged Material
  ['PKG', 'Packaged Material', '', '', 'Packaged Material', 'ROOT', 'Packaged Material', 'Clean Dry Ambient', 'Visual + Dimension + Barcode Scannability', 'HSN-3923', 15, 'Active'],
  ['PKG-FLX', 'Packaged Material', 'Flexible Barrier Packaging', '', 'Packaged Material › Flexible Barrier Packaging', 'PKG', 'Packaged Material', 'Clean Room Storage (<25°C)', 'Seal Integrity + Burst Pressure + Barrier Migration', 'HSN-3923', 21, 'Active'],
  ['PKG-FLX-PCH', 'Packaged Material', 'Flexible Barrier Packaging', 'Spouted Pouches', 'Packaged Material › Flexible Barrier Packaging › Spouted Pouches', 'PKG-FLX', 'Packaged Material', 'Dust-Free Enclosure', 'Leak Test (Vacuum 0.5 bar) + Spout Welds + BPA Free', 'HSN-3923', 25, 'Active'],
  ['PKG-FLX-FIL', 'Packaged Material', 'Flexible Barrier Packaging', 'Laminate Film Rolls', 'Packaged Material › Flexible Barrier Packaging › Laminate Film Rolls', 'PKG-FLX', 'Packaged Material', 'Clean Room Storage', 'Tensile Strength + Optical Density + Print Registration', 'HSN-3920', 14, 'Active'],
  ['PKG-SEC', 'Packaged Material', 'Secondary & Tertiary Packaging', '', 'Packaged Material › Secondary & Tertiary Packaging', 'PKG', 'Packaged Material', 'Dry Warehouse', 'ECT / Bursting Strength + Dimensional Accuracy', 'HSN-4819', 10, 'Active'],
  ['PKG-SEC-BOX', 'Packaged Material', 'Secondary & Tertiary Packaging', 'Corrugated Shipping Cartons', 'Packaged Material › Secondary & Tertiary Packaging › Corrugated Boxes', 'PKG-SEC', 'Packaged Material', 'Dry Warehouse Elevated', 'Edge Crush Test (ECT) + Moisture Resistance', 'HSN-4819', 7, 'Active'],
  ['PKG-SEC-CAP', 'Packaged Material', 'Secondary & Tertiary Packaging', 'Child-Safe Closures & Caps', 'Packaged Material › Secondary & Tertiary Packaging › Caps', 'PKG-SEC', 'Packaged Material', 'Clean Sealed Bags', 'Torque Test + Choke Hazard Dimension + Food Grade Cert', 'HSN-3923', 15, 'Active'],

  // Level 0: Semi-Finished
  ['SEMI', 'Semi-Finished', '', '', 'Semi-Finished', 'ROOT', 'Semi-Finished', 'Temperature Controlled Holding Tanks', 'Viscosity + pH + Microbial Screen', 'HSN-2008', 1, 'Active'],
  ['SEMI-PUR', 'Semi-Finished', 'Aseptic Bulk Purees', '', 'Semi-Finished › Aseptic Bulk Purees', 'SEMI', 'Semi-Finished', 'Chilled Buffer Tanks (4°C)', 'Brix Standard + Homogeneity + Aerobic Plate Count', 'HSN-2008', 1, 'Active'],
  ['SEMI-BLD', 'Semi-Finished', 'Premixed Nutritional Blends', '', 'Semi-Finished › Premixed Nutritional Blends', 'SEMI', 'Semi-Finished', 'Sealed Nitrogen Purged Containers', 'Assay Uniformity + Sieve Fineness', 'HSN-2106', 2, 'Active'],

  // Level 0: Finished Goods
  ['FIN', 'Finished', '', '', 'Finished', 'ROOT', 'Finished', 'Air Conditioned Warehouse (<24°C)', 'Commercial Sterility + Post-Packaging Leak + Net Weight', 'HSN-2104', 0, 'Active'],
  ['FIN-PCH', 'Finished', 'Spouted Food Pouches', '', 'Finished › Spouted Food Pouches', 'FIN', 'Finished', 'Palletized Shrinkwrapped (<25°C)', 'Metal Detection + X-Ray + Seal Integrity + Retention Sample', 'HSN-2104', 0, 'Active'],
  ['FIN-MLT', 'Finished', 'Freeze-Dried Yogurt Melts', '', 'Finished › Freeze-Dried Yogurt Melts', 'FIN', 'Finished', 'Low Humidity (<40% RH, <22°C)', 'Water Activity (aw < 0.25) + Dissolution Rate + Moisture', 'HSN-0403', 0, 'Active'],
  ['FIN-POR', 'Finished', 'Instant Dry Porridge Packets', '', 'Finished › Instant Dry Porridge Packets', 'FIN', 'Finished', 'Ambient (<25°C)', 'Weight Verification + Nitrogen Residual Oxygen < 2%', 'HSN-1904', 0, 'Active']
];

// -------------------------------------------------------------
// SHEET 3: Vendor Classification Master
// -------------------------------------------------------------
const vendorClassData = [
  ['VENDOR CLASSIFICATION TAXONOMY MASTER', '', '', '', '', '', '', '', '', '', '', ''],
  ['Hierarchical classification tree for all suppliers, manufacturers, copackers, logistics, and service vendors.', '', '', '', '', '', '', '', '', '', '', ''],
  [],
  [
    'Vendor Class Code',
    'Category (Level 0)',
    'Sub-Category (Level 1)',
    'Full Hierarchy Path',
    'Parent Code',
    'Sourcing Scope',
    'Risk Tier',
    'Mandatory Compliance Checklist',
    'VMS Gate Security Clearance Rule',
    'Spend Type',
    'Standard Payment Terms',
    'Status'
  ],
  // Level 0: Food Processor
  ['V-FOOD', 'Food Processor', '', 'Food Processor', 'ROOT', 'Direct Food Ingredients & Purees', 'Tier 1 (High Risk)', 'FSSAI License, FFSC 22000, Water Testing Report, Allergen Matrix', 'Gate Entry: Sanitation Sanitizing Station + Loading Dock Direct Bay', 'Direct Raw Material Spend', 'Net 30 Days', 'Active'],
  ['V-FOOD-FRU', 'Food Processor', 'Fruit & Puree Processors', 'Food Processor › Fruit & Puree Processors', 'V-FOOD', 'Aseptic Fruit Pulps, Purees, Concentrates', 'Tier 1 (High Risk)', 'FSSAI Manufacturing License, Pest Control Log, Batch CoA', 'Dock Bay 1-3 Only; Driver PPE mandatory (Apron + Hairnet)', 'Direct Raw Material Spend', 'Net 30 Days', 'Active'],
  ['V-FOOD-GRN', 'Food Processor', 'Grain & Cereal Millers', 'Food Processor › Grain & Cereal Millers', 'V-FOOD', 'Cleaned, Roasted, Dehulled Grains & Flours', 'Tier 2 (Medium Risk)', 'FSSAI License, Heavy Metal Test, Mycotoxin/Aflatoxin Cert', 'Dock Bay 4 (Dry Grains); Forklift Unload Protocol', 'Direct Raw Material Spend', 'Net 45 Days', 'Active'],
  ['V-FOOD-DAI', 'Food Processor', 'Dairy & Culture Processors', 'Food Processor › Dairy & Culture Processors', 'V-FOOD', 'Milk Derivatives, Yogurt Concentrates, Probiotics', 'Tier 1 (High Risk)', 'FSSAI Dairy Endorsement, Cold-Chain Data Logger Logs', 'Reefer Truck Thermograph Inspection prior to gate open', 'Direct Raw Material Spend', 'Net 15 Days', 'Active'],

  // Level 0: Contract Manufacturer
  ['V-CM', 'Contract Manufacturer', '', 'Contract Manufacturer', 'ROOT', 'Turnkey Toll Processing & Copacking', 'Tier 1 (High Risk)', 'GMP Audit Certificate, ISO 22000, FSSAI Manufacturing License', 'Executive Visitor Pass + Escorted Factory Access Only', 'Outsourced Manufacturing Cost', 'Milestone (50% Advance / 50% Delivery)', 'Active'],
  ['V-CM-POU', 'Contract Manufacturer', 'Pouch Copackers', 'Contract Manufacturer › Pouch Copackers', 'V-CM', 'Form-Fill-Seal Retort Spouted Pouches', 'Tier 1 (High Risk)', 'Cleanroom Environmental Swabs, Autoclave Validation Cert', 'Production Zone Badging; Cleanroom Gowning Clearance', 'Direct Processing Spend', 'Net 30 Days', 'Active'],
  ['V-CM-DRY', 'Contract Manufacturer', 'Freeze-Drying & Dehydration', 'Contract Manufacturer › Freeze-Drying & Dehydration', 'V-CM', 'Sublimation Vacuum Freeze Drying of Melts', 'Tier 1 (High Risk)', 'HACCP Plan Validation, Moisture Control Logs', 'Cleanroom Gowning Clearance + Air Shower Passage', 'Direct Processing Spend', 'Net 30 Days', 'Active'],

  // Level 0: Packaging Supplier
  ['V-PKG', 'Packaging Supplier', '', 'Packaging Supplier', 'ROOT', 'Primary, Secondary, Tertiary Packaging', 'Tier 2 (Medium Risk)', 'GSTIN, ISO 9001, Migration Test Certificate (BPA Free)', 'Loading Dock Bay 5-6 (Packaging Reception)', 'Direct Packaging Spend', 'Net 45 Days', 'Active'],
  ['V-PKG-FLX', 'Packaging Supplier', 'Flexible Packaging Converters', 'Packaging Supplier › Flexible Packaging Converters', 'V-PKG', 'Multi-Layer Laminate Pouch Materials', 'Tier 2 (Medium Risk)', 'Food Contact Compliance, US FDA 21 CFR Cert', 'Dock 5; Pallet Seal Check', 'Direct Packaging Spend', 'Net 45 Days', 'Active'],
  ['V-PKG-COR', 'Packaging Supplier', 'Corrugation & Box Makers', 'Packaging Supplier › Corrugation & Box Makers', 'V-PKG', 'Outer Shipping Master Cartons', 'Tier 3 (Low Risk)', 'GSTIN, Paper Moisture Certificate', 'Dock 6 (Bulk Cartons)', 'Indirect / Packaging Spend', 'Net 60 Days', 'Active'],

  // Level 0: Retail Brand & Wholesalers
  ['V-RET', 'Retail Brand', '', 'Retail Brand', 'ROOT', 'Branded Packaged Commodities & Spices', 'Tier 2 (Medium Risk)', 'GSTIN, FSSAI Marketing License, Trademark Authorization', 'Standard Gate Reception Pass', 'Commercial Merchandise Spend', 'Net 15 Days', 'Active'],
  ['V-RET-SP', 'Retail Brand', 'Packaged Spices & Condiments', 'Retail Brand › Packaged Spices & Condiments', 'V-RET', 'Commercial Consumer-Packaged Spices & Seasonings', 'Tier 2 (Medium Risk)', 'FSSAI License, Agmark Certification', 'Dock 4 Inwarding Gate', 'Direct Ingredient Spend', 'Net 30 Days', 'Active'],

  // Level 0: Fresh Fruits Supplier
  ['V-FRU', 'Fresh Fruits Supplier', '', 'Fresh Fruits Supplier', 'ROOT', 'Primary Agricultural Produce & Farm Mandis', 'Tier 1 (High Risk)', 'Mandi License / Farmer KYC, Phytosanitary Certificate', 'Fresh Produce Unloading Yard; Immediate Inwarding', 'Direct Agricultural Spend', 'Weekly / Immediate Settlement', 'Active'],
  ['V-FRU-ORG', 'Fresh Fruits Supplier', 'Certified Organic Orchards', 'Fresh Fruits Supplier › Certified Organic Orchards', 'V-FRU', 'Pesticide-Free, NPOP / USDA Certified Fruits', 'Tier 1 (High Risk)', 'NPOP Organic Scope Certificate, Farm Lot Traceability', 'Fresh Inspection Bay; Segregated Organic Unload Zone', 'Premium Agricultural Spend', 'Net 7 Days', 'Active'],

  // Level 0: Other / Logistics / MRO
  ['V-OTH', 'Other', '', 'Other', 'ROOT', 'Equipment, MRO, Facility Services', 'Tier 3 (Low Risk)', 'GSTIN, Vendor Registration Form, Bank Details', 'General Visitor Badge (Security Escort for sensitive zones)', 'Operating Expense (OPEX)', 'Net 30 Days', 'Active'],
  ['V-OTH-LOG', 'Other', 'Cold-Chain Logistics Carriers', 'Other › Cold-Chain Logistics Carriers', 'V-OTH', 'Reefer Transport, Dry Vans, Express Freight', 'Tier 1 (High Risk)', 'Vehicle Fitness, Pollution Cert, Temperature Logger Calibration', 'Gate Security Vehicle Inspection + Datalogger Retrieval', 'Freight & SCM OPEX', 'Net 15 Days', 'Active']
];

// -------------------------------------------------------------
// SHEET 4: Master Data Link Matrix
// -------------------------------------------------------------
const masterLinkData = [
  ['MASTER DATA TO CLASSIFICATION LINK MATRIX', '', '', '', '', '', '', '', '', ''],
  ['Cross-referencing Material Master SKUs and Vendor Master Profiles with their respective Classifications.', '', '', '', '', '', '', '', '', ''],
  [],
  [
    'Master Entity Type',
    'Entity ID / SKU Code',
    'Entity Name',
    'Company / Partner',
    'Assigned Classification Code',
    'Classification Breadcrumb Path',
    'Unit / Entity Role',
    'Base Price / Terms',
    'Mandatory Compliance / Storage',
    'Lifecycle Status'
  ],
  // Materials Linkages
  ['Material Master', 'RM-PEARL-MILLET-BAJ', 'Pearl Millet (Bajra)', 'Sri Balaji Traders', 'RAW-GRN-MIL', 'Raw Material › Grains & Cereals › Millets & Sorghum', 'Kg', '₹35.00 / kg', 'Dry Storage (<25°C), Moisture <11%', 'Active'],
  ['Material Master', 'RM-SPLIT-RED-LENTIL', 'Split Red Lentils', 'Sri Balaji Traders', 'RAW-GRN-PUL', 'Raw Material › Grains & Cereals › Pulses & Lentils', 'Kg', '₹126.00 / kg', 'Dry Storage, Foreign Matter <0.5%', 'Active'],
  ['Material Master', 'RM-RED-PUMPKIN', 'Red Pumpkin (Fresh)', 'Vida Agro', 'RAW-AGR-VEG', 'Raw Material › Fresh Agricultural › Vegetables & Tubers', 'Kg', '₹22.00 / kg', 'Cold Storage (4-8°C), AQL 1.0 Inspection', 'Active'],
  ['Material Master', 'RM-ALPHONSO-MANGO', 'Alphonso Mango Puree', 'Jain Farm Fresh', 'SEMI-PUR', 'Semi-Finished › Aseptic Bulk Purees', 'Kg', '₹165.00 / kg', 'Aseptic Chilled Buffer, Brix > 16°', 'Active'],
  ['Material Master', 'RM-STRAWBERRY-PUR', 'Frozen Strawberry Puree', 'SHIMLA HILLS OFFERINGS PVT LTD', 'RAW-AGR-FRT', 'Raw Material › Fresh Agricultural › Fruits & Berries', 'Kg', '₹140.00 / kg', 'Deep Freeze (-18°C), Microbial <1000 CFU', 'Active'],
  ['Material Master', 'RM-ROLLED-OATS-ORG', 'Organic Rolled Oats', 'Nutri Organics', 'RAW-GRN-OAT', 'Raw Material › Grains & Cereals › Oats & Flakes', 'Kg', '₹68.00 / kg', 'Cool & Dry (<20°C), Peroxide Value Pass', 'Active'],
  ['Material Master', 'RM-YOGURT-CULTURE', 'Probiotic Freeze-Dried Yogurt Culture', 'Nakoda Dairy', 'RAW-DAI-YOG', 'Raw Material › Dairy & Cultures › Yogurt Cultures', 'Kg', '₹850.00 / kg', 'Deep Freeze (-18°C), Probiotic CFU > 10^9', 'Active'],
  ['Material Master', 'PKG-SPOUT-POUCH-100', '100ml Matte Spouted Pouch', 'Nexibles', 'PKG-FLX-PCH', 'Packaged Material › Flexible Barrier Packaging › Spouted Pouches', 'pcs', '₹4.20 / pc', 'Clean Sealed Boxes, Burst Pressure > 2.5 bar', 'Active'],
  ['Material Master', 'PKG-CHOKE-SAFE-CAP', 'Anti-Choke Slotted Cap 12mm', 'Fotune Pet Pack', 'PKG-SEC-CAP', 'Packaged Material › Secondary & Tertiary Packaging › Caps', 'pcs', '₹0.85 / pc', 'Dust Free, Food Contact Certification', 'Active'],
  ['Material Master', 'PKG-CARTON-24X100', 'Printed Shipper Carton 24x100ml', 'Royal Packaging', 'PKG-SEC-BOX', 'Packaged Material › Secondary & Tertiary Packaging › Corrugated Boxes', 'pcs', '₹18.50 / pc', 'Elevated Pallet, Bursting Strength > 14 kg/cm²', 'Active'],
  ['Material Master', 'FG-MANGO-PCH-100ML', 'Mango & Banana Puree Pouch 100ml', 'VMS Internal Mfg', 'FIN-PCH', 'Finished › Spouted Food Pouches', 'pcs', '₹65.00 (MRP)', 'AC Warehouse (<24°C), Commercial Sterility', 'Active'],
  ['Material Master', 'FG-STRAW-MELT-20G', 'Freeze-Dried Strawberry Yogurt Melts 20g', 'VMS Internal Mfg', 'FIN-MLT', 'Finished › Freeze-Dried Yogurt Melts', 'pcs', '₹95.00 (MRP)', 'Low Humidity (<40% RH), aw < 0.25', 'Active'],

  // Vendors Linkages
  ['Vendor Master', 'VEN-BALAJI-01', 'Sri Balaji Traders', 'Sri Balaji Traders', 'V-FOOD-GRN', 'Food Processor › Grain & Cereal Millers', 'Primary Sourcing Partner', 'Net 45 Days', 'GSTIN: 33ABCDE1234F1Z5, FSSAI: 10018042000234', 'Active'],
  ['Vendor Master', 'VEN-VIDA-02', 'Vida Agro Farms', 'Vida Agro', 'V-FRU-ORG', 'Fresh Fruits Supplier › Certified Organic Orchards', 'Farm Mandi / Grower', 'Net 7 Days', 'GSTIN: 27AABCV1234G1Z9, NPOP Organic Cert: ORG-1029', 'Active'],
  ['Vendor Master', 'VEN-JAIN-03', 'Jain Farm Fresh Representative', 'Jain Farm Fresh', 'V-FOOD-FRU', 'Food Processor › Fruit & Puree Processors', 'Strategic Pulp Supplier', 'Net 30 Days', 'GSTIN: 27AAACJ1234D1Z2, FFSC 22000, FSSAI Approved', 'Active'],
  ['Vendor Master', 'VEN-SHIMLA-04', 'Shimla Hills Sourcing Officer', 'SHIMLA HILLS OFFERINGS PVT LTD', 'V-FOOD-FRU', 'Food Processor › Fruit & Puree Processors', 'Approved Cold Storage Source', 'Net 30 Days', 'GSTIN: 02AAECS9876M1Z8, FSSAI: 10015011000567', 'Active'],
  ['Vendor Master', 'VEN-NEXIBLES-05', 'Nexibles Packaging Lead', 'Nexibles', 'V-PKG-FLX', 'Packaging Supplier › Flexible Packaging Converters', 'Primary Flexible Supplier', 'Net 45 Days', 'GSTIN: 27AABCN5432P1Z1, ISO 9001:2015, US FDA 21 CFR', 'Active'],
  ['Vendor Master', 'VEN-NAKODA-06', 'Nakoda Dairy Representative', 'Nakoda Dairy', 'V-FOOD-DAI', 'Food Processor › Dairy & Culture Processors', 'Dairy Ingredients Partner', 'Net 15 Days', 'GSTIN: 24AABCN8899K1Z4, FSSAI Dairy: 10017021000890', 'Active'],
  ['Vendor Master', 'VEN-ROYAL-07', 'Royal Packaging Account Mgr', 'Royal Packaging', 'V-PKG-COR', 'Packaging Supplier › Corrugation & Box Makers', 'Tertiary Packaging Vendor', 'Net 60 Days', 'GSTIN: 33AABCR1122L1Z3, MSME Registered', 'Active']
];

// -------------------------------------------------------------
// SHEET 5: ERP & VMS Workflow Blueprint
// -------------------------------------------------------------
const workflowData = [
  ['END-TO-END ERP & VMS OPERATIONAL WORKFLOW BLUEPRINT', '', '', '', '', '', '', ''],
  ['Lifecycle state-machines demonstrating how Classifications govern transactions from Sourcing to Payment.', '', '', '', '', '', '', ''],
  [],
  [
    'Stage Code',
    'Workflow Stage',
    'Triggering Event',
    'Responsible Actor',
    'Classification Engine Rule & Enforcement',
    'Pre-Conditions & Validation Gates',
    'System Outputs & Transactions',
    'Inventory & Financial Impact'
  ],
  [
    'WF-01',
    'Taxonomy & Policy Governance',
    'New Material Group or Sourcing Category Required',
    'Category Manager / MDM Admin',
    'Validates circular hierarchy, assigns parent node, defines default inspection protocol and HSN code.',
    'User must possess Editor or Admin role; Parent category must be active and not a descendant.',
    'Active MaterialClassification or VendorClassification node created in MongoDB.',
    'Zero financial impact; sets operational policy boundaries for all future master records.'
  ],
  [
    'WF-02',
    'Master Data Onboarding',
    'New Item or Supplier Contract Enrolled',
    'Procurement Lead / Sourcing Officer',
    'Requires valid categoryId. Material inherits lead time and storage rules; Vendor inherits mandatory regulatory checklist.',
    'Material SKU uniqueness check; Vendor GSTIN format validation; FSSAI / FFSC mandatory for food suppliers.',
    'Material Master / Vendor Master created with normalized categoryId pointer; audit trail logged.',
    'Item becomes available for Bill of Materials (BOM) integration and RFQ supplier shortlisting.'
  ],
  [
    'WF-03',
    'MRP Demand & PO Generation',
    'Sales Forecast or Safety Stock Deficit Detected',
    'Automated MRP Engine / Buyer',
    'MRP filters candidate vendors strictly matching the Material Classification and approved sourcing scope.',
    'Material reorderPoint reached; Vendor must be Active, non-blacklisted, with unexpired FSSAI license.',
    'Purchase Order (PO) generated in "Submitted" state; routed for Segregation of Duties approval.',
    'Inventory Ledger marks required quantity as "Committed / In-Transit"; encumbers purchasing budget.'
  ],
  [
    'WF-04',
    'VMS Gate Entry & Visitor Security',
    'Vendor Truck / Representative Arrives at Plant Gate',
    'VMS Gate Security Officer',
    'Vendor Classification determines entry zone: Food deliveries routed to dock bays 1-3 with sanitation protocol.',
    'Driver must present Valid PO Number, Vehicle Fitness, and unexpired Batch Certificate of Analysis (CoA).',
    'VMS Visitor / Vehicle Pass issued; RFID badge printed; Gate Inward Entry timestamped.',
    'Physical goods enter quarantine perimeter; no financial release until QA passes.'
  ],
  [
    'WF-05',
    'Goods Receipt Inwarding (GRN)',
    'Shipment Unloaded at Assigned Loading Dock',
    'Warehouse Receiving Supervisor',
    'System pulls Material Classification inspection rules (e.g. Temperature thermograph check for chilled purees).',
    'PO must be in Approved state; Inward quantity must not exceed PO tolerance (e.g. +/- 5%).',
    'Goods Receipt Note (GRN) created; Inventory Transaction recorded as "Quarantine / Inspection Buffer".',
    'Quarantine inventory account debited; Accrued Inward Liabilities credited.'
  ],
  [
    'WF-06',
    'Quality Control (QC Gate)',
    'GRN Ready for Sampling in Inspection Buffer',
    'Quality Assurance (QA) Inspector',
    'Executes mandatory testing regimen dictated by Material Classification (AQL, Brix, Microbial, Moisture).',
    'Sample quantity taken per ISO 2859-1 standards; lab results compared against specification tolerances.',
    'Inspection Certificate issued: "Passed", "Conditionally Accepted", or "Rejected / Return to Vendor (RTV)".',
    'If Passed: Stock transferred from Inspection Buffer to Active Warehouse Bin; Released to MRP.'
  ],
  [
    'WF-07',
    '3-Way Matching & AP Settlement',
    'Supplier Invoices Submitted for Payment',
    'Finance / Accounts Payable Manager',
    'Validates 3-way match: PO Quantity & Price vs GRN Received vs Supplier Tax Invoice.',
    'Quantity match within tolerance; Price variance <= standard threshold; Vendor bank details verified.',
    'Payment Voucher approved; Invoice posted to General Ledger; Dispatched to ERP Banking Interface.',
    'Accounts Payable cleared; General Ledger cash account debited upon NEFT/RTGS settlement.'
  ]
];

// -------------------------------------------------------------
// WORKBOOK CREATION & FORMATTING
// -------------------------------------------------------------
const wb = XLSX.utils.book_new();

function createStyledSheet(data, colWidths) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  if (colWidths) {
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
  }
  return ws;
}

// Add sheets to workbook
const wsOverview = createStyledSheet(overviewData, [25, 35, 60, 50]);
XLSX.utils.book_append_sheet(wb, wsOverview, 'Executive Overview');

const wsMaterial = createStyledSheet(materialClassData, [15, 20, 25, 28, 45, 12, 18, 25, 35, 18, 15, 10]);
XLSX.utils.book_append_sheet(wb, wsMaterial, 'Material Classifications');

const wsVendor = createStyledSheet(vendorClassData, [15, 22, 28, 42, 12, 35, 18, 45, 45, 22, 20, 10]);
XLSX.utils.book_append_sheet(wb, wsVendor, 'Vendor Classifications');

const wsMasterLink = createStyledSheet(masterLinkData, [18, 22, 35, 30, 20, 45, 15, 18, 45, 12]);
XLSX.utils.book_append_sheet(wb, wsMasterLink, 'Master Data Link Matrix');

const wsWorkflow = createStyledSheet(workflowData, [12, 25, 32, 25, 45, 45, 45, 45]);
XLSX.utils.book_append_sheet(wb, wsWorkflow, 'ERP & VMS Workflow');

// Write out to file
XLSX.writeFile(wb, outputPath);

console.log('=============================================================');
console.log('SUCCESS: Material & Vendor Classification Excel Master Created');
console.log('Output Target : ' + outputPath);
console.log('Total Sheets  : ' + wb.SheetNames.length);
console.log('Sheet Names   : ' + wb.SheetNames.join(', '));
console.log('=============================================================');
