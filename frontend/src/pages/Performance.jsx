import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { TextArea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Star, Plus, ShieldCheck, Heart, User } from 'lucide-react';

const Performance = () => {
  const [analytics, setAnalytics] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    vendorId: '',
    rating: 5,
    feedback: ''
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  // Fetch Analytics & Full Ratings Logs
  const fetchPerformanceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resAnalytics, resRatings, resVendors] = await Promise.all([
        api.get('/api/performance/analytics'),
        api.get('/api/performance'),
        api.get('/api/vendors?limit=100')
      ]);

      if (resAnalytics.data.success) {
        setAnalytics(resAnalytics.data.data);
      }
      if (resRatings.data.success) {
        setRatings(resRatings.data.data);
      }
      if (resVendors.data.success) {
        // Only allow evaluating Active vendors
        const activeOnly = resVendors.data.data.filter(v => v.status === 'Active');
        setVendors(activeOnly);
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch performance parameters.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformanceData();
  }, []);

  const handleOpenModal = () => {
    setFormData({
      vendorId: '',
      rating: 5,
      feedback: ''
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.vendorId) errors.vendorId = 'Please select a vendor affiliate';
    if (!formData.feedback.trim()) errors.feedback = 'Written feedback is required for audit logs';
    if (formData.feedback.trim().length < 5) errors.feedback = 'Feedback notes must be at least 5 characters long';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      await api.post('/api/performance', formData);
      fetchPerformanceData();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to register performance rating.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  const renderStars = (score, isClickable = false, onSelect = null) => {
    return (
      <div className="flex items-center space-x-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            onClick={() => isClickable && onSelect && onSelect(star)}
            className={`h-4.5 w-4.5 ${
              star <= score
                ? 'fill-amber-400 text-amber-400'
                : 'text-slate-200 fill-slate-200'
            } ${isClickable ? 'cursor-pointer hover:scale-110 active:scale-95 transition-transform' : ''}`}
          />
        ))}
      </div>
    );
  };

  // Compute stats metrics
  const totalAudits = ratings.length;
  const systemAverage = totalAudits > 0 
    ? parseFloat((ratings.reduce((sum, r) => sum + r.rating, 0) / totalAudits).toFixed(2)) 
    : 0.0;
  const perfectScoreCount = ratings.filter(r => r.rating === 5).length;

  return (
    <div className="space-y-6">
      {/* Analytics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Operational Quality Average</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{systemAverage > 0 ? `${systemAverage} / 5.0` : 'N/A'}</h3>
              <p className="text-xs text-slate-500 font-medium">Aggregated across active reviews</p>
            </div>
            <div className="bg-amber-50 text-amber-500 p-3.5 rounded-2xl">
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Audits Submitted</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{totalAudits}</h3>
              <p className="text-xs text-slate-500 font-medium">Archived internal supplier checkups</p>
            </div>
            <div className="bg-blue-50 text-blue-600 p-3.5 rounded-2xl">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Perfect Evaluations (5★)</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{perfectScoreCount}</h3>
              <p className="text-xs text-slate-500 font-medium">Outstanding performance scores</p>
            </div>
            <div className="bg-rose-50 text-rose-500 p-3.5 rounded-2xl">
              <Heart className="h-6 w-6 fill-rose-500 text-rose-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Supplier Averages */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Supplier Performance Matrix</CardTitle>
                <CardDescription>Average performance scores calculated per vendor profile</CardDescription>
              </div>
              <Button onClick={handleOpenModal} className="flex items-center space-x-1">
                <Plus className="h-4 w-4" />
                <span>Evaluate</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center">
                  <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : analytics.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400 font-semibold">
                  No supplier audit records found in database.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor Company</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Evaluations</TableHead>
                      <TableHead>Average Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.map((item) => (
                      <TableRow key={item.vendorId}>
                        <TableCell>
                          <div className="font-bold text-slate-800">{item.company}</div>
                          <div className="text-[10px] text-slate-400">Representative: {item.vendorName}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="info">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="font-bold text-slate-500 text-xs">
                          {item.count} audits
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {renderStars(Math.round(item.averageRating))}
                            <span className="text-xs font-extrabold text-slate-800">({item.averageRating})</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Recent Review Feed logs */}
        <div className="lg:col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Recent Audit Feed</CardTitle>
              <CardDescription>Live comments and scores from operations teams</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto max-h-[400px] space-y-4">
              {loading ? (
                <div className="p-10 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : ratings.length === 0 ? (
                <p className="text-xs text-slate-400 font-semibold text-center py-10">No recent evaluations available.</p>
              ) : (
                ratings.map((log) => (
                  <div key={log._id} className="border border-slate-100 rounded-lg p-3.5 bg-slate-50/40 hover:bg-slate-50 transition-colors space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs text-slate-800 truncate max-w-[120px]">
                        {log.vendorId?.company || 'Supplier'}
                      </h5>
                      <span className="text-[9px] text-slate-400 font-medium">{new Date(log.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      {renderStars(log.rating)}
                      <div className="flex items-center space-x-1 text-[9px] text-slate-400 font-bold">
                        <User className="h-3 w-3 text-slate-300" />
                        <span className="truncate max-w-[80px]">{log.ratedBy?.username || 'System'}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed italic pt-1">
                      "{log.feedback}"
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Evaluation Dialogue */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Submit Performance Evaluation"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          {/* Supplier Selector */}
          <div className="flex flex-col space-y-1.5">
            <label htmlFor="vendorId" className="text-xs font-semibold text-slate-600">
              Audit Target Supplier
            </label>
            <select
              id="vendorId"
              value={formData.vendorId}
              onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
              className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer ${
                formErrors.vendorId ? 'border-red-500' : 'border-slate-200'
              }`}
              required
            >
              <option value="" disabled>Select Vendor</option>
              {vendors.map(v => (
                <option key={v._id} value={v._id}>{v.company} ({v.name})</option>
              ))}
            </select>
            {formErrors.vendorId && <span className="text-xs text-red-500 font-medium">{formErrors.vendorId}</span>}
          </div>

          {/* Stars Input */}
          <div className="flex flex-col space-y-2 py-1">
            <span className="text-xs font-semibold text-slate-600">Quality Assessment Rating</span>
            <div className="flex items-center space-x-1.5">
              {renderStars(formData.rating, true, (score) => setFormData({ ...formData, rating: score }))}
              <span className="text-xs font-extrabold text-amber-500 ml-1.5">({formData.rating} / 5.0)</span>
            </div>
          </div>

          <TextArea
            label="Audit Notes & Detailed Comments"
            id="feedback"
            placeholder="Write constructive observations on SLA response, execution, quality, and deliverables..."
            value={formData.feedback}
            onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
            error={formErrors.feedback}
            rows={4}
            required
          />

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button variant="outline" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitLoading}>
              Post Audit Review
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default Performance;
