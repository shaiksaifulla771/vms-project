export type UserRole = "admin" | "editor" | "viewer";

export interface Me {
  id: string;
  email: string | null;
  role: UserRole;
}

export interface ApiErrorBody {
  detail: string;
  retryable?: boolean;
}

export type VendorStatus = "DRAFT" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "BLACKLISTED";
export type MasterDataStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
export type ItemClassification = "RAW_MATERIAL" | "PACKAGING" | "EMULSIFIER" | "CONSUMABLE" | "FINISHED_GOOD";
export type PriceSource = "QUOTE" | "CONTRACT" | "SPOT" | "PO_HISTORY";
export type PrStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CONVERTED" | "CANCELLED";
export type PoStatus = "DRAFT" | "ISSUED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED";

export interface Vendor {
  id: string;
  code: string;
  name: string;
  legal_name: string | null;
  status: VendorStatus;
  contact_email: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  payment_terms_days: number;
  credit_limit: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  classification: ItemClassification;
  uom: string;
  hsn_code: string | null;
  safety_stock: string;
  reorder_point: string;
  moq: string;
  lead_time_days: number;
  is_hazardous: boolean;
  status: MasterDataStatus;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  uom: string;
  pack_size: string | null;
  status: MasterDataStatus;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialVendor {
  id: string;
  material_id: string;
  vendor_id: string;
  mpn_code: string;
  specifications: Record<string, unknown>;
  certifications: string[];
  is_hazardous: boolean;
  purchase_approved: boolean;
  is_preferred: boolean;
  moq: string;
  lead_time_days: number;
  status: MasterDataStatus;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorPrice {
  id: string;
  material_vendor_id: string;
  currency: string;
  unit_price: string;
  min_order_qty: string;
  valid_from: string;
  valid_to: string | null;
  source: PriceSource;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorPriceComparisonRow {
  material_vendor_id: string;
  vendor_id: string;
  vendor_name: string;
  mpn_code: string;
  is_preferred: boolean;
  currency: string;
  unit_price: string;
  min_order_qty: string;
  valid_from: string;
  valid_to: string | null;
}

export interface PurchaseRequestItem {
  id: string;
  line_no: number;
  material_id: string;
  quantity: string;
  uom: string;
  suggested_vendor_id: string | null;
  notes: string | null;
}

export interface PurchaseRequest {
  id: string;
  pr_number: string;
  title: string;
  status: PrStatus;
  required_by: string;
  justification: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  items: PurchaseRequestItem[];
}

export interface PurchaseOrderItem {
  id: string;
  line_no: number;
  material_id: string;
  material_vendor_id: string | null;
  quantity_ordered: string;
  quantity_received: string;
  unit_price: string;
  tax_percent: string;
  line_total: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  pr_id: string | null;
  vendor_id: string;
  status: PoStatus;
  currency: string;
  subtotal: string;
  tax_total: string;
  grand_total: string;
  expected_delivery_date: string | null;
  issued_at: string | null;
  issued_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  items: PurchaseOrderItem[];
}

export interface Receipt {
  id: string;
  po_id: string;
  po_item_id: string;
  receipt_number: string;
  received_qty: string;
  received_at: string;
  on_time: boolean;
  quality_ok: boolean;
  notes: string | null;
  created_by: string;
}

export interface VendorScorecardRow {
  vendor_id: string;
  vendor_name: string;
  total_purchase_orders: number;
  total_spend: string;
  on_time_delivery_pct: string | null;
  quality_acceptance_pct: string | null;
  avg_lead_time_days: string | null;
}

export type InventoryTxnType =
  | "INWARD_PURCHASE"
  | "OUTWARD_DISPOSAL"
  | "STOCK_ADJUSTMENT"
  | "MFG_CONSUMPTION"
  | "MFG_PRODUCTION"
  | "DYNAMIC_RECONCILIATION";
export type PlanStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type BatchStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface Location {
  id: string;
  name: string;
  code: string;
  address: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  location_id: string;
  name: string;
  code: string;
  is_default: boolean;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryLot {
  id: string;
  lot_number: string;
  material_id: string | null;
  product_id: string | null;
  location_id: string;
  warehouse_id: string;
  mfg_date: string;
  expiry_date: string;
  quantity_on_hand: string;
  uom: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  lot_id: string;
  transaction_type: InventoryTxnType;
  quantity: string;
  balance_after: string;
  reference_id: string | null;
  reason_notes: string | null;
  executed_by: string;
  created_at: string;
}

export interface AvailabilityResponse {
  material_id: string;
  location_id: string;
  qty_available: string;
}

export interface ReconciliationRow {
  lot_id: string;
  lot_number: string;
  cached_quantity: string;
  ledger_sum: string;
}

export interface PlanLine {
  material_id: string;
  formula_percentage: string;
  qty_required: string;
  qty_available: string;
  delta: string;
  status: string;
}

export interface PlanProduct {
  id: string;
  product_id: string;
  location_id: string;
  demand_target_qty: string;
  batch_size_output: string;
  bom_id: string;
  batches_required: number;
  lines: PlanLine[];
}

export interface Plan {
  id: string;
  plan_number: string;
  status: PlanStatus;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  products: PlanProduct[];
}

export interface PlanSummaryBatchRow {
  product_id: string;
  location_id: string;
  planned_batches: number;
  executed_batches: number;
  completed_output_qty: string;
}

export interface PlanSummaryMaterialRow {
  material_id: string;
  total_required_qty: string;
  total_available_qty: string;
  status: string;
}

export interface PlanSummary {
  plan: Plan;
  batch_summary: PlanSummaryBatchRow[];
  material_summary: PlanSummaryMaterialRow[];
}

export interface BatchActualInputLot {
  id: string;
  consumed_lot_id: string;
  quantity: string;
}

export interface BatchActualInput {
  id: string;
  material_id: string;
  bom_percentage: string;
  planned_input_qty: string;
  actual_input_qty: string;
  variance_pct: string;
  variance_reason: string | null;
  lots: BatchActualInputLot[];
}

export interface BomItem {
  id: string;
  material_id: string;
  formula_percentage: string;
  standard_qty: string;
  uom: string;
}

export interface Bom {
  id: string;
  product_id: string;
  version: number;
  is_active: boolean;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  items: BomItem[];
}

export interface Batch {
  id: string;
  batch_number: string;
  plan_id: string | null;
  product_id: string;
  location_id: string;
  warehouse_id: string;
  planned_output_qty: string;
  actual_output_qty: string | null;
  output_variance_qty: string | null;
  output_variance_pct: string | null;
  output_variance_reason: string | null;
  mfg_date: string;
  expiry_date: string;
  status: BatchStatus;
  executed_by: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}
