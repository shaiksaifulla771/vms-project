const PDFDocument = require('pdfkit');

/**
 * Generates a clean, corporate-grade PDF report and pipes it to the HTTP response.
 * @param {Object} res Express response object
 * @param {Object} data Summary metrics and 6 insights
 */
const generatePDFReport = (res, data) => {
  // Pass autoPageBreak: false to completely prevent PDFKit from creating page 2
  const doc = new PDFDocument({ margin: 30, size: 'A4', autoPageBreak: false });

  // Stream PDF response to HTTP output
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=ERP_Operations_Executive_Report_${Date.now()}.pdf`);
  doc.pipe(res);

  // 1. Color Palette (Manufacturing SaaS Theme)
  const primaryColor = '#0f172a';   // Deep Slate/Black
  const accentColor = '#2563eb';    // Electric Blue
  const textDark = '#334155';       // Slate text
  const textLight = '#64748b';      // Light Slate text

  // 2. HEADER
  doc.rect(0, 0, 595.28, 10).fill(accentColor); // Top bar decoration
  doc.y = 25;
  
  doc.fillColor(primaryColor)
     .fontSize(20)
     .font('Helvetica-Bold')
     .text('Enterprise Manufacturing ERP Portal', 40, doc.y);
  
  doc.fontSize(9)
     .font('Helvetica')
     .fillColor(textLight)
     .text(`Executive Operations & Shop Floor Analytics Report | Generated: ${new Date().toLocaleString()}`, 40, doc.y + 22);

  doc.moveDown(1);
  doc.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(1);

  // 3. SUMMARY METRICS SECTION
  doc.fillColor(primaryColor)
     .fontSize(14)
     .font('Helvetica-Bold')
     .text('1. Operational Summary Indicators', 40, doc.y);
  
  doc.moveDown(0.5);

  const metrics = [
    { label: 'Total Material Base', value: `${data.summary.totalMaterials} Profiles (${data.summary.rawMaterials} Raw, ${data.summary.finishedGoods} Finished)` },
    { label: 'Recipe Configuration', value: `${data.summary.totalBOMs} Active BOM Recipes` },
    { label: 'SCM Procurement Spend', value: `$${data.summary.totalProcurementSpend.toLocaleString()} spend across ${data.summary.receivedPOs} POs` },
    { label: 'Manufacturing Runs', value: `${data.summary.totalProductions} Batches (${data.summary.completedProductions} Complete, ${data.summary.checkedProductions} QC Checked)` },
    { label: 'QC Compliance Rate', value: `${data.summary.avgPerformanceRating.toFixed(1)}% QC Pass Rate (${data.summary.passedQCInspections} Passed, ${data.summary.failedQCInspections} Failed)` },
    { label: 'Warehouse Stock Volume', value: `${data.summary.totalStockQuantity.toLocaleString()} Units (${data.summary.materialsWithStock} in stock)` }
  ];

  let currentY = doc.y;
  metrics.forEach((metric, index) => {
    const isEven = index % 2 === 0;
    const colX = isEven ? 40 : 300;
    const colY = currentY + Math.floor(index / 2) * 38;

    // Card background
    doc.rect(colX, colY, 255, 32).fillColor('#f8fafc').fill();
    doc.rect(colX, colY, 3, 32).fillColor(accentColor).fill();

    // Text details
    doc.fillColor(textLight)
       .fontSize(8)
       .font('Helvetica-Bold')
       .text(metric.label.toUpperCase(), colX + 12, colY + 6);

    doc.fillColor(primaryColor)
       .fontSize(9.5)
       .font('Helvetica')
       .text(metric.value, colX + 12, colY + 16, { width: 235, height: 12, ellipsis: true });
  });

  doc.y = currentY + 3 * 38 + 10;

  // 4. STRATEGIC INSIGHTS SECTION (MAX 6)
  doc.fillColor(primaryColor)
     .fontSize(14)
     .font('Helvetica-Bold')
     .text('2. Executive Insights (Core ERP Analytics)', 40, doc.y);
  
  doc.moveDown(0.6);

  data.insights.forEach((insight, index) => {
    const yStart = doc.y;
    
    // Draw insight badge number
    doc.fillColor('#eff6ff').rect(40, yStart, 18, 18).fill();
    doc.fillColor(accentColor)
       .fontSize(9)
       .font('Helvetica-Bold')
       .text((index + 1).toString(), 40, yStart + 5, { align: 'center', width: 18 });

    // Insight title
    doc.fillColor(primaryColor)
       .fontSize(9.5)
       .font('Helvetica-Bold')
       .text(insight.title, 68, yStart + 1);

    // Insight description
    doc.fillColor(textDark)
       .fontSize(8.5)
       .font('Helvetica')
       .text(insight.description, 68, yStart + 12, { width: 485 });

    doc.moveDown(0.95);
  });

  // 5. SIGN-OFF FOOTER
  // Disable automatic page break before laying down the footer to lock it to page 1
  doc.options.autoPageBreak = false;
  doc.y = doc.page.height - 85;
  doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  
  doc.y += 5;
  doc.fillColor(textLight)
     .fontSize(7.5)
     .font('Helvetica')
     .text(
       'This executive summary was generated dynamically from synchronized database balances in the Manufacturing ERP system.\nConfidential - Corporate Operations Use Only',
       { align: 'center', width: 515, lineGap: 3 }
     );

  doc.end();
};

/**
 * Generates a clean, corporate single-record MPN specification sheet PDF.
 * @param {Object} res Express response object
 * @param {Object} mpn MPN document populated with materialId & vendorId
 */
const generateSingleMpnPDF = (res, mpn) => {
  const doc = new PDFDocument({ margin: 35, size: 'A4', autoPageBreak: false });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=MPN_${mpn.mpnCode || 'Record'}.pdf`);
  doc.pipe(res);

  const primaryColor = '#0f172a';
  const accentColor = '#2563eb';
  const textDark = '#334155';
  const textLight = '#64748b';

  doc.rect(0, 0, 595.28, 10).fill(accentColor);
  doc.y = 30;

  doc.fillColor(primaryColor)
     .fontSize(18)
     .font('Helvetica-Bold')
     .text(`MPN Master Specification Sheet — ${mpn.mpnCode || 'MPN'}`, 40, doc.y);

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor(textLight)
     .text(`Manufacturer Part Number Specification | Generated: ${new Date().toLocaleString()}`, 40, doc.y + 20);

  doc.moveDown(1);
  doc.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(1.5);

  const fields = [
    { label: 'System MPN ID', value: mpn.mpnCode || '—' },
    { label: 'Manufacturer Part Number', value: mpn.manufacturerPartNumber || '—' },
    { label: 'MPN Name', value: mpn.mpnName || '—' },
    { label: 'Manufacturer Name', value: mpn.isDirectFromManufacturer ? `${mpn.manufacturerName} (Same as Vendor)` : mpn.manufacturerName || '—' },
    { label: 'Linked Material', value: mpn.materialId ? `${mpn.materialId.name} (${mpn.materialId.code || '—'})` : '—' },
    { label: 'Linked Vendor', value: mpn.vendorId ? `${mpn.vendorId.name} ${mpn.vendorId.company ? `(${mpn.vendorId.company})` : ''}` : '—' },
    { label: 'Unit Price', value: mpn.unitPrice !== undefined && mpn.unitPrice !== null ? `₹${mpn.unitPrice}` : '—' },
    { label: 'Minimum Order Qty (MOQ)', value: mpn.moq !== undefined && mpn.moq !== null ? `${mpn.moq} ${mpn.uom || ''}` : '—' },
    { label: 'Unit of Measure (UOM)', value: mpn.uom || '—' },
    { label: 'Applicable GST Rate', value: mpn.gst !== undefined && mpn.gst !== null ? `${mpn.gst}%` : '—' },
    { label: 'Record Status', value: mpn.status || 'Active' },
    { label: 'Part Specification Notes', value: mpn.partDescription || 'None' },
  ];

  let startY = doc.y;
  fields.forEach((f, idx) => {
    const rowY = startY + (idx * 28);
    doc.rect(40, rowY, 515, 24).fillColor(idx % 2 === 0 ? '#f8fafc' : '#ffffff').fill();

    doc.fillColor(textLight)
       .fontSize(9)
       .font('Helvetica-Bold')
       .text(f.label, 50, rowY + 6, { width: 180 });

    doc.fillColor(primaryColor)
       .fontSize(9.5)
       .font('Helvetica')
       .text(String(f.value), 230, rowY + 6, { width: 310, ellipsis: true });
  });

  doc.options.autoPageBreak = false;
  doc.y = doc.page.height - 50;
  doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.y += 5;
  doc.fillColor(textLight)
     .fontSize(7.5)
     .font('Helvetica')
     .text('VMS Manufacturing ERP — Official Manufacturer Part Number Master Document', { align: 'center', width: 515 });

  doc.end();
};

module.exports = { generatePDFReport, generateSingleMpnPDF };
