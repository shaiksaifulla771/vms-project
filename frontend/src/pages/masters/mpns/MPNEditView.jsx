import React, { useState, useEffect } from 'react';
import MasterPageWrapper from '../../../components/masters/MasterPageWrapper';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ChevronLeft, Save, X, AlertCircle } from 'lucide-react';

export default function MPNEditView({ mpn, isNew = false, materials = [], vendors = [], onBack, onSave, loading = false, error = null }) {
  const [formData, setFormData] = useState({
    mpnNumber: '',
    manufacturerName: '',
    isDirectFromManufacturer: false,
    material: '',
    vendor: '',
    unitPrice: 0,
    moq: 1,
    leadTimeDays: 0,
    status: 'Active',
    description: ''
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (mpn) {
      setFormData({
        mpnNumber: mpn.mpnNumber || mpn.mfrPartNumber || mpn.manufacturerPartNumber || '',
        manufacturerName: mpn.manufacturerName || mpn.manufacturer || '',
        isDirectFromManufacturer: Boolean(mpn.isDirectFromManufacturer),
        material: typeof mpn.material === 'object' ? mpn.material?._id : (mpn.material || mpn.materialId || ''),
        vendor: typeof mpn.vendor === 'object' ? mpn.vendor?._id : (mpn.vendor || mpn.vendorId || ''),
        unitPrice: mpn.unitPrice || mpn.price || 0,
        moq: mpn.moq || 1,
        leadTimeDays: mpn.leadTimeDays || 0,
        status: mpn.status || 'Active',
        description: mpn.description || mpn.partDescription || ''
      });
    }
  }, [mpn]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => {
        let updatedMfr = prev.manufacturerName;
        if (checked && prev.vendor) {
          const foundVendor = vendors.find(v => (v._id || v.id) === prev.vendor);
          if (foundVendor) {
            updatedMfr = foundVendor.name || foundVendor.company || '';
          }
        }
        return {
          ...prev,
          [name]: checked,
          manufacturerName: checked ? updatedMfr : prev.manufacturerName
        };
      });
    } else {
      setFormData(prev => {
        let updated = {
          ...prev,
          [name]: type === 'number' ? Number(value) : value
        };
        if (name === 'vendor' && prev.isDirectFromManufacturer) {
          const foundVendor = vendors.find(v => (v._id || v.id) === value);
          if (foundVendor) {
            updated.manufacturerName = foundVendor.name || foundVendor.company || '';
          }
        }
        return updated;
      });
    }
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleSameAsVendorToggle = (checked) => {
    setFormData(prev => {
      let updatedMfr = prev.manufacturerName;
      if (checked && prev.vendor) {
        const foundVendor = vendors.find(v => (v._id || v.id) === prev.vendor);
        if (foundVendor) {
          updatedMfr = foundVendor.name || foundVendor.company || '';
        }
      }
      return {
        ...prev,
        isDirectFromManufacturer: checked,
        manufacturerName: checked && updatedMfr ? updatedMfr : prev.manufacturerName
      };
    });
  };

  const validate = () => {
    const errs = {};
    if (!formData.mpnNumber.trim()) errs.mpnNumber = 'Part Number is required';
    if (!formData.manufacturerName.trim()) errs.manufacturerName = 'Manufacturer name is required';
    if (!formData.material) errs.material = 'Material is required';
    if (!formData.vendor) errs.vendor = 'Vendor is required';
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
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to MPNs
          </button>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isNew ? 'Create New MPN Record' : `Edit MPN: ${mpn?.mpnNumber || mpn?.mfrPartNumber || ''}`}
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
            {loading ? 'Saving...' : isNew ? 'Create MPN' : 'Save Changes'}
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
              MPN Specifications & Sourcing
            </h3>
          </CardHeader>
          <CardContent className="p-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              {/* Mfr Part No */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mfr Part Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="mpnNumber"
                  value={formData.mpnNumber}
                  onChange={handleChange}
                  placeholder="e.g. STM32F407VGT6"
                  className={`w-full h-8 px-2.5 text-xs bg-white border rounded-md focus:outline-none transition-all ${
                    formErrors.mpnNumber ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {formErrors.mpnNumber && <p className="text-[10px] text-red-500 mt-1">{formErrors.mpnNumber}</p>}
              </div>

              {/* Linked Vendor */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Approved Vendor <span className="text-red-500">*</span>
                </label>
                <select
                  name="vendor"
                  value={formData.vendor}
                  onChange={handleChange}
                  className={`w-full h-8 px-2 text-xs bg-white border rounded-md text-slate-800 focus:outline-none ${
                    formErrors.vendor ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'
                  }`}
                >
                  <option value="">-- Select Vendor --</option>
                  {vendors.map(v => (
                    <option key={v._id || v.id} value={v._id || v.id}>{v.vendorId || v.code} - {v.name} {v.company ? `(${v.company})` : ''}</option>
                  ))}
                </select>
                {formErrors.vendor && <p className="text-[10px] text-red-500 mt-1">{formErrors.vendor}</p>}
              </div>

              {/* Manufacturer Name & Same as Vendor Checkbox */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Manufacturer <span className="text-red-500">*</span>
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer text-[11px] font-semibold text-blue-700 select-none">
                    <input
                      type="checkbox"
                      name="isDirectFromManufacturer"
                      checked={formData.isDirectFromManufacturer}
                      onChange={(e) => handleSameAsVendorToggle(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span>Same as Vendor</span>
                  </label>
                </div>
                <input
                  type="text"
                  name="manufacturerName"
                  value={formData.manufacturerName}
                  onChange={handleChange}
                  placeholder="e.g. STMicroelectronics"
                  className={`w-full h-8 px-2.5 text-xs bg-white border rounded-md focus:outline-none transition-all ${
                    formErrors.manufacturerName ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {formErrors.manufacturerName && <p className="text-[10px] text-red-500 mt-1">{formErrors.manufacturerName}</p>}
              </div>

              {/* Linked Material */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Linked Internal Material <span className="text-red-500">*</span>
                </label>
                <select
                  name="material"
                  value={formData.material}
                  onChange={handleChange}
                  className={`w-full h-8 px-2 text-xs bg-white border rounded-md text-slate-800 focus:outline-none ${
                    formErrors.material ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'
                  }`}
                >
                  <option value="">-- Select Material --</option>
                  {materials.map(m => (
                    <option key={m._id || m.id} value={m._id || m.id}>{m.code} - {m.name}</option>
                  ))}
                </select>
                {formErrors.material && <p className="text-[10px] text-red-500 mt-1">{formErrors.material}</p>}
              </div>

              {/* Unit Price */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Sourcing Price (₹)</label>
                <input
                  type="number"
                  name="unitPrice"
                  min={0}
                  step="0.01"
                  value={formData.unitPrice}
                  onChange={handleChange}
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* MOQ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min Order Qty (MOQ)</label>
                <input
                  type="number"
                  name="moq"
                  min={1}
                  value={formData.moq}
                  onChange={handleChange}
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Lead Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lead Time (Days)</label>
                <input
                  type="number"
                  name="leadTimeDays"
                  min={0}
                  value={formData.leadTimeDays}
                  onChange={handleChange}
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Status */}
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

              {/* Description */}
              <div className="sm:col-span-2 md:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Datasheet Specifications & Notes</label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Enter technical tolerances, package details, or notes..."
                  className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </MasterPageWrapper>
  );
}
