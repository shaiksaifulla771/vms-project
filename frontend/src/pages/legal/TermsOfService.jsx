import React from 'react';
import { FileText, CheckCircle2, AlertTriangle, ShieldCheck, ChevronRight } from 'lucide-react';
import usePageMeta from '../../hooks/usePageMeta';
import { Link } from 'react-router-dom';

export default function TermsOfService() {
  usePageMeta('Terms of Service', 'Enterprise software terms of service, acceptable use policies, and SLA commitments for VendorOS.');

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-8 border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-3">
          <FileText className="w-3.5 h-3.5" />
          Enterprise License & Service Agreement
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Terms of Service</h1>
        <p className="text-sm text-slate-400 mt-2">
          Effective Date: August 21, 2026 &bull; Version 2.4 (Enterprise Production)
        </p>
      </div>

      {/* Content Sections */}
      <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            1. Authorized Enterprise Access
          </h2>
          <p className="mb-3">
            VendorOS is provided exclusively for authorized corporate personnel, plant managers, procurement officers, and certified suppliers. Access credentials must remain confidential and cannot be shared across multiple individuals.
          </p>
          <p className="text-slate-400">
            System actions taken with your credentials are authenticated and permanently recorded in the immutable audit trail.
          </p>
        </section>

        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            2. Production Order & Planning Integrity
          </h2>
          <p className="mb-3">
            All production plans, material substitutions, and stock adjustments must adhere to defined standard operating procedures and maker-checker segregation rules.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li>Production releases must be backed by verified material availability or approved shortage exceptions.</li>
            <li>Custom materials added outside standard BOM definitions require managerial sign-off.</li>
            <li>Rescheduled orders must have documented operational justifications for tracking.</li>
          </ul>
        </section>

        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            3. Limitation of Liability & SLA
          </h2>
          <p className="mb-3">
            While VendorOS utilizes high-availability architecture with sub-second deterministic MRP netting algorithms, automated planning proposals should be reviewed by qualified supply chain personnel before committing high-value purchase orders.
          </p>
        </section>
      </div>

      {/* Footer Navigation */}
      <div className="mt-10 pt-6 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
        <Link to="/privacy-policy" className="hover:text-indigo-400 transition-colors flex items-center gap-1">
          View Privacy Policy <ChevronRight className="w-3.5 h-3.5" />
        </Link>
        <Link to="/dashboard" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
