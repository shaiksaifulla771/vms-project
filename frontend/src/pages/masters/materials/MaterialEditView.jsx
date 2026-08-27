import React, { useState, useEffect } from 'react';
import MasterPageWrapper from '../../../components/masters/MasterPageWrapper';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ChevronLeft, Save, X, AlertCircle } from 'lucide-react';

export default function MaterialEditView({ material, isNew = false, onBack, onSave, loading = false, error = null }) {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    unit: 'PCS',
    type: 'Raw Material',
    subcategory: '',
    description: '',
    status: 'Active'
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (material) {
      setFormData({
        name: material.name || '',
        code: material.code || '',
        unit: material.unit || 'PCS',
        type: material.type || 'Raw Material',
        subcategory: material.subcategory || '',
        description: material.description || '',
        status: material.status || 'Active'
      });
    }
  }, [material]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Material name is required';
    if (!isNew && !formData.code.trim()) errs.code = 'Material code is required';
    if (!formData.unit) errs.unit = 'Unit of measure is required';
    if (!formData.type) errs.type = 'Category is required';
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
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Materials
          </button>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isNew ? 'Create New Material' : `Edit Material: ${material?.code || ''}`}
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
            {loading ? 'Saving...' : isNew ? 'Create Material' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-semibold flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card - No icons, clean header */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="border border-slate-200 bg-white shadow-2xs rounded-lg overflow-hidden">
          <CardHeader className="py-2.5 px-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Material Information
            </h3>
          </CardHeader>
          <CardContent className="p-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {/* Material Name */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Material Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Raw Cumin Powder (Grade A)"
                  className={`w-full h-8 px-2.5 text-xs bg-white border rounded-md focus:outline-none transition-all ${
                    formErrors.name ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                {formErrors.name && <p className="text-[10px] text-red-500 mt-1">{formErrors.name}</p>}
              </div>

              {/* Material Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Material Code {!isNew && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  disabled={!isNew}
                  placeholder="Auto-generated"
                  className="w-full h-8 px-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-md text-slate-700 disabled:cursor-not-allowed"
                />
              </div>

              {/* UOM */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unit of Measure (UOM) <span className="text-red-500">*</span>
                </label>
                <select
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="PCS">PCS</option>
                  <option value="KG">KG</option>
                  <option value="GM">GM</option>
                  <option value="L">L</option>
                  <option value="ML">ML</option>
                  <option value="MTR">MTR</option>
                  <option value="BOX">BOX</option>
                  <option value="SET">SET</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="Raw Material">Raw Material</option>
                  <option value="Finished">Finished Product</option>
                  <option value="Semi-Finished">Semi-Finished</option>
                  <option value="Packaged Material">Packaged Material</option>
                </select>
              </div>

              {/* Sub-Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sub-Category</label>
                <input
                  type="text"
                  name="subcategory"
                  value={formData.subcategory}
                  onChange={handleChange}
                  placeholder="e.g. Spices, Hardware"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Description */}
              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description & Quality Notes</label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Enter specifications, technical tolerances, or notes..."
                  className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </MasterPageWrapper>
  );
}
