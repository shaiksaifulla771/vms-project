# Enterprise VMS (Vendor & Manufacturing System)
## Project Workflow, Logic, & Architecture Documentation

This document outlines the architecture, programming stack, core workflows, and system logic currently implemented in your Enterprise VMS project.

---

### 1. Technology Stack & Tools

**Backend Core:**
- **Node.js & Express.js**: The primary backend API framework.
- **MongoDB & Mongoose**: NoSQL Database for scalable, document-oriented storage. Mongoose is heavily used for schema validation, pre/post hooks, and business logic enforcement.
- **Python (Microservice)**: A standalone Python microservice (`mrp_optimizer/main.py`) handles complex mathematical MRP (Material Requirements Planning) optimizations, likely utilizing tools like `scipy` or `OR-Tools`.

**Frontend:**
- **Vite & React (or similar SPA framework)**: Provides a fast, hot-reloading frontend development environment.
- **Axios / Fetch API**: Used for communicating with the backend microservices.

**Security & Authentication:**
- **Dual-Engine Authentication**: Uses Native JWT (JSON Web Tokens) for internal sessions + Firebase ID Tokens for extended identity verification.
- **Bcrypt.js**: For secure password hashing.

**Testing:**
- **Jest & Supertest**: Comprehensive unit and integration testing suite for backend routes, event buses, and controllers.

---

### 2. Security, RBAC, & Governance Logic

The system is built with strict enterprise-grade security and data integrity rules:

- **Dual-Engine Auth**: Users must authenticate via Firebase and the native system.
- **Role-Based Access Control (RBAC)**: Routes are protected by `authorize([...roles])` middleware. Roles include `Admin`, `Inventory Manager`, `Warehouse Operator`, `Vendor`, etc.
- **3-Level Access Scope Governance**: Governed by `checkScope` middleware and `scopeResolver.js`. Users are explicitly assigned to specific Sites or Warehouses via `UserAccessAssignment`. The system dynamically checks if a user is authorized to perform actions (like unassigning materials) within that specific geographic or logical boundary.
- **Soft-Deactivation (Append-Only Audit)**: Hard deletes are strictly blocked using Mongoose `pre('deleteOne')` and `pre('deleteMany')` hooks. Data is never destroyed; instead, it is soft-deleted using `deactivatedAt`, `deactivatedBy`, and `deactivationReason` fields to maintain a flawless audit trail.

---

### 3. Core Domain Workflows & Logic

#### A. Master Data Management (MDM)
- **Sites & Warehouses**: Defines the physical layout of the enterprise.
- **Materials (`Material.js`)**: The global catalog of parts, assemblies, and raw materials.
- **Warehouse Materials (`WarehouseMaterial.js`)**: Links global materials to specific warehouses with localized data like `minStock`, `maxStock`, `reorderPoint`, and localized pricing. 

#### B. Inventory & Logistics
- **Inventory Tracking (`InventoryItem.js`, `InventoryTransaction.js`)**: Tracks physical stock levels, batches, and serial numbers. Utilizes Optimistic Concurrency Control (OCC) to prevent race conditions during concurrent stock updates (e.g., two people pulling stock simultaneously).
- **Stock Transfers (`StockTransfer.js`)**: Manages the movement of goods between warehouses. Incorporates a lifecycle (Draft -> In Transit -> Received) and triggers events via the `DomainEventBus`.
- **Stock Adjustments (`StockAdjustment.js`)**: Handles cycle counts, shrinkages, and audits.

#### C. Manufacturing & BOM (Bill of Materials)
- **BOM & Flat BOMs (`BOM.js`, `BOMVersion.js`, `FlatBOM.js`)**: Defines how assemblies are built from raw materials. Flat BOMs are generated dynamically to optimize database reads during deep hierarchical manufacturing lookups.
- **Production Planning (`ProductionPlan.js`, `ProductionOrder.js`)**: Transforms sales or forecasts into actual manufacturing orders.

#### D. Material Requirements Planning (MRP)
- **MRP Engine (`mrpEngineService.js`)**: A sophisticated engine that analyzes current inventory, active Production Orders, pending Purchase Orders, and BOMs to determine exactly *what* needs to be bought and *when*.
- **Python Optimization Fallback**: If the mathematical complexity exceeds the Node.js native solver, it hands the payload to the Python `mrp_optimizer` microservice. If the Python service fails (e.g., status 400), it gracefully falls back to the native Node.js solver.

#### E. Vendor & Procurement
- **Vendors (`Vendor.js`, `VendorMaster.js`)**: Manages supplier details and catalogs (MPN - Manufacturer Part Numbers).
- **Purchase Orders (`PurchaseOrder.js`, `PurchaseRequest.js`)**: Generated automatically by the MRP engine or manually by procurement managers.

#### F. Event-Driven Workflows
- **Domain Event Bus (`eventBus.js`)**: An internal pub/sub system decoupled from direct HTTP requests. When an event happens (e.g., `QC_PASSED` or `STOCK_TRANSFERRED`), the Event Bus triggers background tasks.
- **Trigger-Condition-Action Engine (`Workflow.js`, `WorkflowExecution.js`)**: A highly configurable engine allowing admins to set up rules (e.g., "If Stock drops below Reorder Point, Email Warehouse Manager").
- **Email Queuing (`EmailQueue.js`, `EmailLog.js`)**: Background processing of emails to prevent blocking the main thread.

---

### 4. Code Execution & Data Flow Example

*Scenario: An Inventory Manager unassigns a Material from a Warehouse.*
1. **Request**: `DELETE /api/warehouse-materials/:id`
2. **Auth Middleware**: Validates Native JWT & Firebase Token.
3. **RBAC Middleware**: Checks if user is `Admin` or `Inventory Manager`.
4. **Scope Resolver**: Queries `UserAccessAssignment` to ensure the user has rights to the specific `warehouseId`.
5. **Controller Logic**: Uses `WarehouseMaterial.findById()` to locate the record.
6. **Governance Hook**: Mongoose intercepts the `.deleteOne()` command, blocks it, and instead updates `status = 'Inactive'`, `deactivatedAt = Date.now()`, and saves the record.
7. **Response**: User receives a `200 OK` (or `403 Access Denied` if step 4 fails with a clean JSON payload).
8. **Event Bus (Optional)**: Emits a `MATERIAL_UNASSIGNED` event which might trigger an email via the Workflow Engine to the procurement team.

---

### 5. Summary of Built-in Quality Assurance

- **Idempotency Keys (`IdempotencyKey.js`)**: Prevents duplicate transactions (e.g., accidentally creating two purchase orders if a user double-clicks the submit button).
- **Comprehensive Logging (`Logger.js`, `AuditLog.js`)**: Every action is traced with correlation IDs for easy debugging and compliance reporting.
- **Automated Tests**: Over 70 Jest unit tests ensuring that edge cases (like empty strings in stock transfers or OCC conflicts) are caught before deployment.
