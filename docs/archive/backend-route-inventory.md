# Backend Route Inventory

This document maps all express routes to their controllers and middleware.

## Auth (`authRoutes.js`)
- `POST /api/auth/register` -> `registerUser`
- `POST /api/auth/login` -> `loginUser`
- `GET /api/auth/me` -> `getMe` (Auth: Yes)
- `POST /api/auth/forgotpassword` -> `forgotPassword`
- `PUT /api/auth/resetpassword/:resettoken` -> `resetPassword`

## Vendors (`vendorRoutes.js`)
- `GET /api/vendors/sequence-peek` -> `peekNextVendorCode` (Auth: Yes)
- `GET /api/vendors/next-code` -> `getNextVendorCode` (Auth: Yes)
- `POST /api/vendors/batch` -> `createVendorsBatch` (Auth: Yes)
- `POST /api/vendors/batch-upload` -> `createVendorsBatchUpload` (Auth: Yes)
- `POST /api/vendors/batch-delete-source` -> `deleteVendorsBySource` (Auth: Yes)
- `POST /api/vendors/batch-delete` -> `batchDeleteVendors` (Auth: Yes)
- `GET /api/vendors` -> `getVendors` (Auth: Yes)
- `POST /api/vendors` -> `createVendor` (Auth: Yes)
- `GET /api/vendors/:id` -> `getVendor` (Auth: Yes)
- `PUT /api/vendors/:id` -> `updateVendor` (Auth: Yes)
- `DELETE /api/vendors/:id` -> `deleteVendor` (Auth: Yes)

## Vendor Masters (`vendorMasterRoutes.js`)
*(Skipped full expansion for brevity. Handles bulk operations and duplicates).*

## Materials (`materialRoutes.js`)
- `POST /api/materials/batch` -> `createMaterialsBatch` (Auth: Yes)
- `POST /api/materials/batch-upload` -> `createMaterialsBatchUpload` (Auth: Yes)
- `POST /api/materials/batch-delete-source` -> `deleteMaterialsBySource` (Auth: Yes)
- `POST /api/materials/batch-delete` -> `batchDeleteMaterials` (Auth: Yes)
- `GET /api/materials/sequence-peek` -> `peekNextMaterialCode` (Auth: Yes)
- `GET /api/materials/next-code` -> `getNextMaterialCode` (Auth: Yes)
- `GET /api/materials` -> `getMaterials` (Auth: Yes)
- `POST /api/materials` -> `createMaterial` (Auth: Yes)
- `GET /api/materials/:id` -> `getMaterial` (Auth: Yes)
- `PUT /api/materials/:id` -> `updateMaterial` (Auth: Yes)
- `DELETE /api/materials/:id` -> `deleteMaterial` (Auth: Yes)

## MPNs (`mpnRoutes.js`)
- `GET /api/mpns/sequence-peek` -> `peekNextMPNCode` (Auth: Yes)
- `GET /api/mpns/manufacturers` -> `getManufacturers` (Auth: Yes)
- `GET /api/mpns/export` -> `exportMPNsExcel` (Auth: Yes)
- `GET /api/mpns/deleted` -> `getDeletedMPNs` (Auth: Yes)
- `POST /api/mpns/batch-delete` -> `batchDeleteMPNs` (Auth: Yes)
- `POST /api/mpns/bulk` -> `bulkCreateMPNs` (Auth: Yes)
- `GET /api/mpns/:id/pdf` -> `generateMPNPdf` (Auth: Yes)
- `PUT /api/mpns/:id/restore` -> `restoreMPN` (Auth: Yes)
- `GET /api/mpns` -> `getMPNs` (Auth: Yes)
- `POST /api/mpns` -> `createMPN` (Auth: Yes)
- `GET /api/mpns/:id` -> `getMPN` (Auth: Yes)
- `PUT /api/mpns/:id` -> `updateMPN` (Auth: Yes)
- `DELETE /api/mpns/:id` -> `deleteMPN` (Auth: Yes)

## BOMs (`bomRoutes.js`)
*(Handles BOM CRUD, duplication, versions, approval workflows).*

## Inventory (`inventoryRoutes.js`)
*(Handles items, transactions, batches).*

## Production, Quality, Purchase, Performance, Reports, Chat
*(Standard CRUD mapped to controllers).*

*Note: All endpoints documented expect standard JSON bodies for POST/PUT (unless using form-data for uploads), respond with `success: true/false`, and leverage `errorHandler` for 500s.*
