import React from 'react';
import { Shield, Lock, Eye, Database, Server, Award, ChevronRight } from 'lucide-react';
import usePageMeta from '../../hooks/usePageMeta';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  usePageMeta('Privacy Policy', 'Enterprise privacy policy, data protection terms, and security standards for VendorOS.');

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-8 border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full mb-3">
          <Shield className="w-3.5 h-3.5" />
          Enterprise Data Governance
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mt-2">
          Effective Date: August 21, 2026 &bull; Version 2.4 (Enterprise Production)
        </p>
      </div>

      {/* Content Sections */}
      <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            1. Information Collection & Usage
          </h2>
          <p className="mb-3">
            VendorOS collects and processes enterprise data necessary to operate manufacturing planning, inventory netting, supplier management, and production scheduling. This includes:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li><strong>User Profile & Authentication Data:</strong> Name, professional email address, hashed credentials, role assignment, and IP address.</li>
            <li><strong>Transactional ERP Records:</strong> Material master definitions, BOM structures, stock ledger movements, and purchase orders.</li>
            <li><strong>Security & Audit Logs:</strong> Immutable records of user actions, approvals, schedule changes, and security events.</li>
          </ul>
        </section>

        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            2. Data Retention & Immutability
          </h2>
          <p className="mb-3">
            To satisfy enterprise accounting, ISO 9001 compliance, and supply chain auditability standards, financial and inventory ledger transactions are stored in append-only logs with strict non-repudiation guarantees.
          </p>
          <p className="text-slate-400">
            Session tokens and transient cache keys expire automatically per the configured enterprise session duration (default: 24 hours).
          </p>
        </section>

        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-400" />
            3. Data Isolation & Access Controls
          </h2>
          <p className="mb-3">
            Access to supplier details, costing information, and bill of materials is governed strictly by the 3-Level Role and Scope Access Control Engine.
          </p>
          <p className="text-slate-400">
            Data is strictly segmented across sites and warehouses. No third-party data broker access or unauthenticated cross-tenant pooling is permitted.
          </p>
        </section>

        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            4. Compliance & Contact
          </h2>
          <p className="mb-3">
            For inquiries regarding enterprise data privacy, access requests, or audit log inspection, please contact your organization&apos;s Data Protection Officer or system administrator at:
          </p>
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-blue-400 inline-block">
            privacy@vendoros.enterprise.internal
          </div>
        </section>
      </div>

      {/* Footer Navigation */}
      <div className="mt-10 pt-6 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
        <Link to="/terms-of-service" className="hover:text-blue-400 transition-colors flex items-center gap-1">
          View Terms of Service <ChevronRight className="w-3.5 h-3.5" />
        </Link>
        <Link to="/dashboard" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
