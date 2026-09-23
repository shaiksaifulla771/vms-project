# Phase 0: Architecture Baseline

## 1. Frontend Architecture
**Directory Structure:**
- `src/App.jsx`: Central router and layout manager. Contains hacky routing logic (`location.pathname.split('/')[1]`).
- `src/pages/`: Contains monolithic UI components.
  - `VendorsTab.jsx` (5,278 lines)
  - `MaterialsTab.jsx` (3,886 lines)
  - `MPNMaster.jsx` (1,104 lines)
- `src/features/`: Contains feature-specific logic, e.g., `bom/BomRecipeEditor.jsx` (600 lines).
- `src/components/`: Minor shared components (e.g., `Sidebar.jsx`, `Header.jsx`).
- `src/services/api.js`: Central Axios instance.

## 2. Backend Architecture
**Directory Structure:**
- `server.js`: Application entry point. **Critically, contains destructive database seeding/wipe logic that runs unconditionally in non-production environments.**
- `routes/`: Express routers mapping URLs to controllers.
- `controllers/`: Fat controllers that handle HTTP req/res, validation, and complex business logic (e.g., `mpnController.js` is 742 lines, `materialController.js` is 721 lines).
- `models/`: Mongoose schemas.
- `middleware/`: Auth (`protect`, `checkRole`) and `errorHandler`.

## 3. Database Models & Relationships (MongoDB)
- **Vendors (`vendors`, `vendormasters`)**: Core supplier records. `Vendor` has `code` and `email` indexed.
- **Materials (`materials`)**: Core inventory items. Includes `code` indexing.
- **MPNs (`mpns`)**: Links Materials to Vendors. Keys: `mpnCode`, `vendorId`, `manufacturerName`.
- **BOMs (`boms`)**: Defines assembly recipes. Relies on `components.mpnId`.
- **ProductionOrders**: Links `BOM`, `MPN`, `Material`, `Warehouse`, `User`.
- **PurchaseOrders**: Links `Vendor`, `Material`, `User`.
- **InventoryItems/Transactions**: Tracks stock levels per Warehouse.

## 4. Code Duplication
- **Frontend Tables:** `VendorsTab.jsx` and `MaterialsTab.jsx` share thousands of lines of identical HTML table definitions, pagination logic, search states, and modal structures.
- **API Fetching:** Similar `useEffect` and `try/catch` data-fetching blocks are repeated across all master data pages.

## 5. Dead Code
- `frontend/src/pages/MastersOriginal.jsx` (9,170 lines) - Identified as an obsolete backup file.
- `frontend/src/pages/Login.backup.jsx` (403 lines) - Obsolete backup.
- Various MongoDB backup collections (`mpns_backup_...`, `vendors_backup_...`) exist in the live database.

## 6. Performance & Indexes
- Good indexes exist on `code` (Materials/Vendors), `email`, and foreign keys (e.g., `mpnId` in BOM components).
- **Bottlenecks:** Bulk import controllers attempt to parse and save hundreds of rows synchronously within a single HTTP request lifecycle. The frontend fetches entire collections (`/api/vendors`) into memory for client-side pagination, which will crash the browser at 10,000+ records.

## 7. Risky Dependencies
- `backend/server.js` relies on a static `config/all_recipes.json` to seed data.
- The UI heavily relies on inline Tailwind CSS instead of abstracted component variants, making global redesigns extremely difficult.
