import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Download, FileBarChart, Lightbulb, AlertTriangle } from 'lucide-react';

const Reports = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/reports/summary');
      if (res.data && res.data.success) {
        setReportData(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed: Could not compile live Manufacturing ERP metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/api/reports/pdf', { responseType: 'blob' });
      const file = new Blob([res.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      
      const pdfLink = document.createElement('a');
      pdfLink.href = fileURL;
      pdfLink.setAttribute('download', `ERP_Executive_Report_${Date.now()}.pdf`);
      document.body.appendChild(pdfLink);
      pdfLink.click();
      
      document.body.removeChild(pdfLink);
      URL.revokeObjectURL(fileURL);
    } catch (err) {
      console.error(err);
      alert('Failed to generate and download ERP PDF report.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
        <p className="text-sm font-semibold text-slate-500">Compiling executive ERP metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center max-w-lg mx-auto mt-20">
        <p className="text-red-700 font-semibold mb-2">{error}</p>
        <button
          onClick={fetchReportData}
          className="mt-2 text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
        >
          Retry Compilation
        </button>
      </div>
    );
  }

  const { summary, insights } = reportData;

  return (
    <div className="space-y-6">
      {/* PDF Download banner */}
      <Card className="bg-slate-900 text-white border-none relative overflow-hidden">
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 z-10">
            <h3 className="text-lg font-bold">Download Executive ERP PDF</h3>
            <p className="text-xs text-slate-400">Generate an official printable report with stock levels, BOM recipes, QC compliance summaries.</p>
          </div>
          <Button
            onClick={handleDownloadPDF}
            isLoading={downloading}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2 shrink-0 z-10 active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
            <span>Generate & Download PDF</span>
          </Button>
        </CardContent>
      </Card>

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Materials Base</div>
            <div className="text-2xl font-black text-slate-800">{summary.totalMaterials} Profiles</div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
              <span className="text-blue-600 font-semibold">{summary.rawMaterials} Raw</span>
              <span>•</span>
              <span className="text-green-600 font-semibold">{summary.finishedGoods} Finished</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Procurement Invested</div>
            <div className="text-2xl font-black text-slate-800">${summary.totalProcurementSpend.toLocaleString()}</div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
              <span className="font-bold text-slate-700">{summary.receivedPOs} POs received</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">QC Batch Pass Rate</div>
            <div className="text-2xl font-black text-slate-800">{summary.avgPerformanceRating}%</div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
              <span className="font-bold text-slate-700">{summary.passedQCInspections} Passed batches</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Warehouse Stock volume</div>
            <div className="text-2xl font-black text-slate-800">{summary.totalStockQuantity.toLocaleString()}</div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
              <span className="font-bold text-slate-700">{summary.materialsWithStock} materials active</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strategic Insights Index (Exactly 6 Insights rendered dynamically) */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <FileBarChart className="h-5 w-5 text-blue-600" />
            <CardTitle>Operational Insights Index</CardTitle>
          </div>
          <CardDescription>Exactly 6 analytical findings pulled from active database registries</CardDescription>
        </CardHeader>
        <CardContent className="p-0 border-t border-slate-100 divide-y divide-slate-100">
          {insights.map((insight, idx) => {
            const isWarning = insight.title.toLowerCase().includes('deficit') || insight.title.toLowerCase().includes('shortage') || insight.title.toLowerCase().includes('risk');
            
            return (
              <div key={idx} className="p-5 flex items-start space-x-4 hover:bg-slate-50/50 transition-colors">
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  isWarning ? 'bg-rose-50 text-rose-600' : 'bg-blue-50/80 text-blue-600'
                }`}>
                  {isWarning ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Lightbulb className="h-5 w-5" />
                  )}
                </div>
                
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                    <span>{insight.title}</span>
                    <Badge variant={isWarning ? 'danger' : 'info'} className="text-[9px] px-1.5 py-0">Insight {idx + 1}</Badge>
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                    {insight.description}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
