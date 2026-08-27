import React, { useState, useEffect } from 'react';
import MasterPageWrapper from '../../../components/masters/MasterPageWrapper';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ChevronLeft, Save, X, AlertCircle } from 'lucide-react';

export default function VendorEditView({ vendor, isNew = false, onBack, onSave, loading = false, error = null }) {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    vendorId: '',
    category: 'Supplier',
    subCategory: '',
    email: '',
    phone: '',
    gstin: '',
    status: 'Active',
    address: '',
    address2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'India',
    bankAccountHolder: '',
    bankAccountNumber: '',
    bankName: '',
    ifscCode: ''
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (vendor) {
      setFormData({
        name: vendor.name || '',
        company: vendor.company || '',
        vendorId: vendor.vendorId || vendor.code || '',
        category: vendor.category || 'Supplier',
        subCategory: vendor.subCategory || '',
        email: vendor.email || '',
        phone: vendor.phone || '',
        gstin: vendor.gstin || '',
        status: vendor.status || 'Active',
        address: vendor.address || '',
        address2: vendor.address2 || '',
        city: vendor.city || '',
        state: vendor.state || '',
        zipCode: vendor.zipCode || '',
        country: vendor.country || 'India',
        bankAccountHolder: vendor.bankAccountHolder || '',
        bankAccountNumber: vendor.bankAccountNumber || '',
        bankName: vendor.bankName || '',
        ifscCode: vendor.ifscCode || ''
      });
    }
  }, [vendor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Contact representative name is required';
    if (!formData.category) errs.category = 'Category is required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSave(formData);
  };

  return (
    <MasterPageWrapper direction={1} className="space-y-4">
      {/* Top Navigation & Title Row with ONLY ONE set of action buttons */}
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer mb-1.5"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Vendors
          </button>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isNew ? 'Onboard New Vendor' : `Edit Vendor: ${vendor?.vendorId || vendor?.name || ''}`}
          </h1>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="h-8 text-xs font-semibold text-slate-600 bg-white border-slate-200 hover:bg-slate-50"
          >
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={loading}
            onClick={handleSubmit}
            className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {loading ? 'Saving...' : isNew ? 'Onboard Vendor' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-semibold flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card - No icons in header */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="border border-slate-200 bg-white shadow-2xs rounded-lg overflow-hidden">
          <CardHeader className="py-2.5 px-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Vendor Information
            </h3>
          </CardHeader>
          <CardContent className="p-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Trade Name</label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  placeholder="e.g. Apex Electronics Ltd"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Representative <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Rajesh Kumar"
                  className={`w-full h-8 px-2.5 text-xs bg-white border rounded-md focus:outline-none transition-all ${
                    formErrors.name ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {formErrors.name && <p className="text-[10px] text-red-500 mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="Food Processor">Food Processor</option>
                  <option value="Packaging Supplier">Packaging Supplier</option>
                  <option value="Raw Material Trader">Raw Material Trader</option>
                  <option value="Contract Manufacturer">Contract Manufacturer</option>
                  <option value="Logistics Partner">Logistics Partner</option>
                  <option value="Supplier">Supplier</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="e.g. contact@vendor.com"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="e.g. +91 9876543210"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">GSTIN Number</label>
                <input
                  type="text"
                  name="gstin"
                  value={formData.gstin}
                  onChange={handleChange}
                  placeholder="e.g. 27AABCU9603R1ZM"
                  className="w-full h-8 px-2.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500 uppercase"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Street / Industrial area"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Code</label>
                <input
                  type="text"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleChange}
                  placeholder="e.g. 400001"
                  className="w-full h-8 px-2.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="e.g. Mumbai"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="e.g. Maharashtra"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleChange}
                  placeholder="e.g. HDFC Bank"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                <input
                  type="text"
                  name="bankAccountNumber"
                  value={formData.bankAccountNumber}
                  onChange={handleChange}
                  placeholder="e.g. 50200012345678"
                  className="w-full h-8 px-2.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
                <input
                  type="text"
                  name="ifscCode"
                  value={formData.ifscCode}
                  onChange={handleChange}
                  placeholder="e.g. HDFC0000123"
                  className="w-full h-8 px-2.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500 uppercase"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </MasterPageWrapper>
  );
}
