---
name: database-management
description: Guide for Mongoose schemas, Atlas cluster connections, transaction resilience, indexing, and data governance in VMS.
---

# Enterprise MongoDB Database Management Skill

## 1. Connection Architecture & Resilience
- **Atlas SRV & Windows DNS Resilience**:
  - Always enforce DNS server fallbacks (`dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4'])`) prior to initial connection to prevent Windows SRV lookup failures (`querySrv ENOTFOUND`).
  - Configure robust connection pooling:
    ```javascript
    {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
      family: 4
    }
    ```
- **In-Memory & Test Fallback**:
  - In `test` or `development` environments where live mongod is offline or unprovisioned, gracefully fall back to `mongodb-memory-server` without terminating the process abruptly.
- **Lifecycle Event Hooks**:
  - Always register connection listeners (`disconnected`, `reconnected`, `error`) on `mongoose.connection` to maintain observability.

---

## 2. Transaction Management & Graceful Degradation
MongoDB multi-document ACID transactions require Replica Sets or Sharded Clusters. In single/standalone instances or memory mock databases, direct transaction calls throw runtime exceptions.

- **Auto-Detection**:
  - Query topology via `admin.command({ hello: 1 })` (or `isMaster: 1` fallback).
- **Safe Transaction Helpers**:
  - Use `startSafeTransaction(session)`, `commitSafeTransaction(session)`, `abortSafeTransaction(session)`, or `withTransaction(session, async () => { ... })`.
- **Session Cleanup**:
  - Always wrap session lifecycles in `try ... finally { session.endSession(); }` to prevent connection leaks.

```javascript
const session = await mongoose.startSession();
startSafeTransaction(session);
try {
  const result = await doc.save({ session });
  await writeAuditLog(session, entityType, doc._id, action, oldDoc, doc, userId);
  await commitSafeTransaction(session);
  return result;
} catch (error) {
  await abortSafeTransaction(session);
  throw error;
} finally {
  session.endSession();
}
```

---

## 3. Schema & Indexing Standards (Mongoose 8.x)
- **Timestamps**: Always specify `{ timestamps: true }` on all Mongoose schemas.
- **Foreign Keys & Reference Indices**:
  - Always index foreign key references (`siteId`, `warehouseId`, `materialId`, `vendorId`, `userId`, `bomId`).
- **Unique & Sparse Indices**:
  - Code/Identifier fields (`code`, `userCode`, `orderNumber`, `firebaseUid`) must use `unique: true` and `sparse: true` where optional.
- **Compound Indices**:
  - Add compound indices for high-frequency queries, multi-tenant scopes, and time-series audit logs:
    - `{ siteId: 1, status: 1 }`
    - `{ entityType: 1, entityId: 1, createdAt: -1 }`
    - `{ materialId: 1, warehouseId: 1 }`

---

## 4. Query Performance & Memory Optimization
- **Read Operations (`.lean()`)**:
  - Use `.lean()` for read-only listings, reports, and serialization to bypass Mongoose document hydration overhead.
- **Field Projections**:
  - Explicitly project required fields when loading large collections or populating relationships (`.select('name code status')`).
- **Batch Processing**:
  - For large datasets or background migrations, chunk queries (e.g. `CHUNK_SIZE = 100`) rather than reading entire collections into RAM.

---

## 5. Enterprise Governance & Auditing
- **Soft Deletion**:
  - For master records (Vendors, Materials, Sites, Users), set `status = 'Deleted'` or `status = 'DEACTIVATED'` rather than dropping documents.
- **Immutable Audit Logging**:
  - Every mutating operation (CREATE, UPDATE, DELETE, IMPORT) must record an immutable entry into `AuditLog` inside the same transactional session whenever possible.
