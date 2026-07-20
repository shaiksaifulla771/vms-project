# 🚀 Vendor Management System (VMS) — Project Handoff & Summary Document

This document serves as a complete, pinned handoff record for the **Vendor Management System (VMS)** project. You can copy this summary or reference `PROJECT_HANDOFF.md` when continuing work on any platform (e.g. ChatGPT, Claude, VS Code, Cursor, or another machine).

---

## 📌 Project Overview & Environment

- **Root Working Directory:** `C:\Users\DELL\.gemini\antigravity\scratch\vms-project`
- **Frontend Directory:** `frontend/` (React + Vite + TailwindCSS + Lucide Icons + SheetJS `xlsx`)
- **Backend Directory:** `backend/` (Node.js + Express + MongoDB Mongoose + JWT Auth)
- **Primary Page File:** `frontend/src/pages/Masters.jsx` (Contains both `MaterialsTab` and `VendorsTab`)

---

## ✅ Completed Features & Specifications

### 1. Vendor Master (`VendorsTab`)
- **Sequential Vendor Codes (`V1001`, `V1002`...):**
  - Managed by backend MongoDB `Sequence` collection (`_id: 'vendorCode'`).
  - Codes start at `V1001` and continuously increment.
  - **Retired Code Logic:** Once assigned, sequence number is permanently bumped. Even if a vendor holding `V1005` is deleted, `V1005` is never reused; the next code will be `V1006`.
- **Selection Mode Toggle ("Select Options"):**
  - Grid row checkboxes and header "Select All" checkbox are hidden by default to keep UI clean.
  - Clicking **"Select Options"** toggle button expands selection checkboxes.
  - **"Delete Selected"** and **"Edit Selected"** action buttons only appear when selection mode is active and at least 1 row is checked.
- **Manual Vendor Registration:**
  - Form handles Basic Information, Categories, GST List, Certifications (FFSC2200, FSSAI), Primary Contact, and Bank Details.
  - Auto-assigns next `V-code` on backend if left blank.
  - Generates instant success Toast (`"Successfully added 1 new vendor record."`).
- **PIN / Zip Code Auto-Fetch:**
  - Uses India Post API (`https://api.postalpincode.in/pincode/{code}`).
  - Automatically fetches `City`, `State`, `Country` as soon as a 6-digit PIN code is typed or blurred.
  - Overwrites previous location every time a user edits to a new PIN code.
- **Bulk Entry & Bulk Update Wizard (100% Parity with Material Master):**
  - **Excel Parser:** Reads spreadsheet in-browser via SheetJS (`XLSX.read`).
  - **Template Download:** Exports sample data spreadsheet with headers and dummy rows (`Vendor_Import_Template.xlsx`).
  - **Bulk Entry Mode:** Displays *New Vendors to Add* (with green `NEW` badge and auto-assigned `V100x` codes) and *Already in Database — Replace or Skip?* panel (with Replace All / Skip All shortcuts and DB vs Spreadsheet comparison).
  - **Bulk Update Mode:** Computes field-level diffs (`oldVal → newVal`) across all 20+ vendor fields. Features filter tabs: `New (N)` | `Changed (N)` | `No Change (N)` | `All (N)`, a live search bar, and per-row `Accept`/`Skip` buttons.
- **Table Column Layout:**
  - Column order: `[Checkbox]` -> `Vendor Name / Code` -> `Company` -> `Notes/Desc` -> `GST Reg` -> `Category` -> `Status` -> `Email` -> `Actions`.
  - `Email` column precedes `Actions` column with functional `mailto:` link.

### 2. Material Master (`MaterialsTab`)
- Full CRUD operations, auto-generated material codes (`M1001`, `M1002`...).
- Bulk Entry & Bulk Update wizards with field diff engine.
- Autosaved Drafts FIFO queue saved to `localStorage`.

---

## 🛠️ Key File Architecture

| File Path | Description |
| :--- | :--- |
| `frontend/src/pages/Masters.jsx` | Main monolithic component containing `MaterialsTab` and `VendorsTab`. |
| `backend/models/Vendor.js` | Mongoose schema for Vendors. Validates `name`, `email` (unique), defaults `company`, `phone`, `address`, `category`. |
| `backend/controllers/vendorController.js` | Handles vendor CRUD, `peekNextVendorCode`, batch creation, and deletion. |
| `backend/models/Sequence.js` | MongoDB collection tracking auto-increment sequences (`vendorCode`, `materialCode`). |
| `backend/routes/vendorRoutes.js` | Express endpoints (`/api/vendors`, `/api/vendors/sequence-peek`, etc.). |

---

## 📜 Recent Git Commit Log

```bash
commit 9bd1bd5b6cf049dc012b9e2550019e1cb7d78b20
Author: shaiksaifulla771 <shaiksaifulla771@gmail.com>
Date:   Mon Jul 20 15:58:06 2026 +0530

    fix: resolve vendor creation schema constraints, zip code auto-fetch update, and instant table sync

commit e6905e5a54737a7dc6fcd8b55eb041e9de7f17a9
Author: shaiksaifulla771 <shaiksaifulla771@gmail.com>
Date:   Mon Jul 20 15:35:31 2026 +0530

    feat: complete Vendor Master feature parity with Material Master (bulk entry/update, auto-codes V1001+, selection mode, toasts)
```

---

## 🚀 How to Run & Resume Work on Any Platform

1. **Start Backend Server:**
   ```bash
   cd backend
   npm install
   npm start # or node server.js (runs on port 5000)
   ```

2. **Start Frontend Dev Server:**
   ```bash
   cd frontend
   npm install
   npm run dev # runs Vite dev server on http://localhost:5173
   ```

3. **Verify Production Build:**
   ```bash
   cd frontend
   npm run build
   ```

---
*Generated and pinned for platform shift & continuation.*
