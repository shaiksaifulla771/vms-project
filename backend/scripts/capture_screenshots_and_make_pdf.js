const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\c5702960-d647-4077-b66c-b313340db06e';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function captureAndGeneratePdf() {
  console.log('=== STARTING BROWSER SCREENSHOT CAPTURE & PDF GENERATION ===');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const routes = [
    { name: 'dashboard', url: 'http://localhost:3000/dashboard', title: 'Dashboard Overview & SCM Telemetry' },
    { name: 'sites', url: 'http://localhost:3000/sites', title: 'Network Facilities & Warehouse Nodes' },
    { name: 'masters', url: 'http://localhost:3000/masters', title: 'Master Data (Materials, Vendors, MPN, BOM)' },
    { name: 'inventory', url: 'http://localhost:3000/inventory', title: 'Warehouse Stock Ledger & Transfers' },
    { name: 'planning', url: 'http://localhost:3000/planning', title: 'MRP Material Requirement Planning' },
    { name: 'scheduling', url: 'http://localhost:3000/scheduling', title: 'Production Scheduling Workbench' },
    { name: 'production', url: 'http://localhost:3000/production', title: 'Shop Floor Production Execution' }
  ];

  const capturedPages = [];

  for (const route of routes) {
    console.log(`Navigating to ${route.url}...`);
    try {
      await page.goto(route.url, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500)); // Wait for HMR & animations

      const imgPath = path.join(SCREENSHOT_DIR, `${route.name}.png`);
      await page.screenshot({ path: imgPath, fullPage: false });
      console.log(`✓ Captured ${route.name}.png`);

      const imgBase64 = fs.readFileSync(imgPath).toString('base64');
      capturedPages.push({
        ...route,
        dataUri: `data:image/png;base64,${imgBase64}`
      });
    } catch (err) {
      console.error(`Failed to capture ${route.name}:`, err.message);
    }
  }

  // Generate HTML Report Document with 2-column visual & workflow structure (NO AI diagram)
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>VendorOS ERP - End-to-End Operational Report</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      * { box-sizing: border-box; }
      body {
        font-family: 'Inter', sans-serif;
        color: #0f172a;
        margin: 0;
        padding: 30px;
        background-color: #ffffff;
        -webkit-print-color-adjust: exact;
      }
      .header-cover {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #ffffff;
        padding: 24px 32px;
        border-radius: 16px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .header-cover h1 {
        font-size: 22px;
        font-weight: 900;
        margin: 0 0 6px 0;
        letter-spacing: -0.5px;
      }
      .header-cover p {
        font-size: 12px;
        color: #94a3b8;
        margin: 0;
        font-weight: 500;
      }
      .header-badge {
        background: #2563eb;
        color: #ffffff;
        font-size: 11px;
        font-weight: 800;
        padding: 6px 14px;
        border-radius: 8px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .section-card {
        margin-bottom: 30px;
        page-break-inside: avoid;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 20px;
        background: #ffffff;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 2px solid #2563eb;
        padding-bottom: 10px;
        margin-bottom: 16px;
      }

      .section-header h2 {
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
        margin: 0;
      }

      .step-pill {
        font-size: 11px;
        font-weight: 800;
        color: #2563eb;
        background: #eff6ff;
        padding: 4px 12px;
        border-radius: 20px;
        border: 1px solid #bfdbfe;
      }

      /* 2-COLUMN LAYOUT: Left (Browser Screenshot UI), Right (How It Works Workflow) */
      .grid-layout {
        display: grid;
        grid-template-cols: 1.3fr 1fr;
        gap: 20px;
        align-items: start;
      }

      .col-left {
        display: flex;
        flex-direction: column;
      }

      .col-header {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #64748b;
        margin-bottom: 8px;
      }

      .screenshot-frame {
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.08);
      }

      .screenshot-frame img {
        width: 100%;
        height: auto;
        display: block;
      }

      .col-right {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .workflow-box {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px;
      }

      .workflow-box h4 {
        font-size: 12px;
        font-weight: 800;
        color: #1e293b;
        margin: 0 0 6px 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .workflow-box p {
        font-size: 11px;
        color: #475569;
        margin: 0;
        line-height: 1.5;
      }

      .gesture-steps {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .gesture-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 11px;
        color: #334155;
      }

      .gesture-icon {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #2563eb;
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        shrink: 0;
      }

      .gesture-text {
        flex: 1;
        line-height: 1.4;
      }

      .page-break {
        page-break-after: always;
      }
    </style>
  </head>
  <body>
    <div class="header-cover">
      <div>
        <h1>VendorOS ERP Operational Workflow Report</h1>
        <p>End-to-End System Execution Architecture: Master Setup → Inventory → MRP → Scheduling → Production Completion</p>
      </div>
      <div class="header-badge">Downloaded System Output</div>
    </div>

    ${capturedPages.map((page, idx) => `
      <div class="section-card ${idx < capturedPages.length - 1 ? 'page-break' : ''}">
        <div class="section-header">
          <h2>Module ${idx + 1}: ${page.title}</h2>
          <span class="step-pill">Stage ${idx + 1} of ${capturedPages.length}</span>
        </div>

        <div class="grid-layout">
          <!-- LEFT COLUMN: LIVE BROWSER UI SCREENSHOT -->
          <div class="col-left">
            <div class="col-header">Current Visual Interface Output</div>
            <div class="screenshot-frame">
              <img src="${page.dataUri}" alt="${page.title}" />
            </div>
          </div>

          <!-- RIGHT COLUMN: OPERATIONAL WORKFLOW & HOW IT WORKS -->
          <div class="col-right">
            <div class="col-header">Operational Workflow & How It Works</div>

            <div class="workflow-box">
              <h4>🎯 Module Purpose</h4>
              <p>${getModulePurpose(page.name)}</p>
            </div>

            <div class="workflow-box">
              <h4>🔄 Step-by-Step Data Flow</h4>
              <div class="gesture-steps">
                ${getModuleSteps(page.name).map((step, sIdx) => `
                  <div class="gesture-item">
                    <div class="gesture-icon">${sIdx + 1}</div>
                    <div class="gesture-text">
                      <strong>${step.action}:</strong> ${step.detail}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="workflow-box" style="border-left: 3px solid #10b981;">
              <h4>⚡ Execution Outcome</h4>
              <p>${getModuleOutcome(page.name)}</p>
            </div>
          </div>
        </div>
      </div>
    `).join('')}
  </body>
  </html>
  `;

  const reportHtmlPath = path.join(ARTIFACT_DIR, 'vendoros_report.html');
  fs.writeFileSync(reportHtmlPath, htmlContent);
  console.log(`✓ Generated HTML report at ${reportHtmlPath}`);

  // Render PDF via Puppeteer
  const pdfPath = path.join(ARTIFACT_DIR, 'VendorOS_ERP_Operational_Report.pdf');
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await pdfPage.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '15px', right: '15px', bottom: '15px', left: '15px' }
  });

  console.log(`✓ Clean PDF Report generated successfully at: ${pdfPath}`);
  await browser.close();
}

function getModulePurpose(name) {
  switch (name) {
    case 'dashboard':
      return 'Central SCM Control Center tracking physical stock, pending manager approval requests, active scheduled commitments, and shop floor execution progress.';
    case 'sites':
      return 'Consolidated Network & Facilities Architecture. Single unified page displaying multi-site plants, warehouse nodes, capacity metrics, and assigned materials.';
    case 'masters':
      return 'Master Data Foundation. Registers Material Master items (Raw, Finished, Packaged), Vendor Master directories, MPN pricing, and BOM recipes.';
    case 'inventory':
      return 'Physical Inventory Ledger & Stock Control. Manages batch-level stock balances, role-based adjustment approvals, inter-warehouse transfers, and immutable ledgers.';
    case 'planning':
      return 'MRP (Material Requirements Planning) Calculation Engine. Evaluates finished goods demand against net available stock and BOM component requirements.';
    case 'scheduling':
      return 'Production Scheduling Workbench. Converts planned orders into scheduled production commitments, manages soft component stock reservations, and queues orders.';
    case 'production':
      return 'Shop Floor Manufacturing Execution. Executes production orders, issues raw component inventory, receives finished goods, and completes shop floor jobs.';
    default:
      return 'Enterprise ERP Operational Module.';
  }
}

function getModuleSteps(name) {
  switch (name) {
    case 'dashboard':
      return [
        { action: 'Context Selection', detail: 'User selects Site / Warehouse context to filter telemetry across all widgets.' },
        { action: 'Pending Approval Inbox', detail: 'Manager/Admin views non-admin stock adjustments and transfer requests awaiting clearance.' },
        { action: 'Real-time Approval Trigger', detail: 'Clicking Approve instantly executes the ledger transaction and updates physical inventory.' }
      ];
    case 'sites':
      return [
        { action: 'Facility Registration', detail: 'User registers Plant / Facility Site with geographic location and contacts.' },
        { action: 'Warehouse Node Linking', detail: 'User creates Raw / FG / WIP warehouses linked directly to parent site.' },
        { action: 'Material Assignment', detail: 'User assigns Material Master items to specific warehouse nodes without record duplication.' }
      ];
    case 'masters':
      return [
        { action: 'Material Registration', detail: 'User defines Material Code, Name, Category, UOM, and Min/Max stock thresholds.' },
        { action: 'Vendor & MPN Linking', detail: 'User links Vendor Master with Manufacturer Part Numbers, unit prices, and lead times.' },
        { action: 'BOM Recipe Creation', detail: 'User defines Bill of Materials specifying exact raw component quantities required per unit.' }
      ];
    case 'inventory':
      return [
        { action: 'Stock Adjustment Request', detail: 'Non-Admin submits adjustment request (IN/OUT); Admin submissions auto-approve immediately.' },
        { action: 'Inter-Warehouse Transfer', detail: 'Requests transfer between warehouses: Pending → Approved (Reserved) → In Transit → Completed.' },
        { action: 'Immutable Ledger Write', detail: 'All physical inventory updates post append-only transaction ledger records.' }
      ];
    case 'planning':
      return [
        { action: 'MRP Run Trigger', detail: 'Planner selects target Finished Good material and specifies required production quantity.' },
        { action: 'Net Requirement Check', detail: 'System explodes BOM and compares required components against net available warehouse stock.' },
        { action: 'Shortage & Order Generation', detail: 'System detects shortages and generates recommended Planned Production Orders.' }
      ];
    case 'scheduling':
      return [
        { action: 'Schedule Plan Commitment', detail: 'Scheduler selects planned order and assigns start/end dates, site context, and priority.' },
        { action: 'Soft Component Reservation', detail: 'Scheduling reserves raw material inventory so other plans cannot over-commit stock.' },
        { action: 'Shop Floor Queue', detail: 'Scheduled plan creates an active Production Order queued for shop floor execution.' }
      ];
    case 'production':
      return [
        { action: 'Order Release & Start', detail: 'Shop floor operator starts scheduled Production Order (Status: In Production).' },
        { action: 'Raw Component Consumption', detail: 'System issues and deducts exact BOM raw component quantities from warehouse stock.' },
        { action: 'Finished Goods Receipt', detail: 'System credits completed finished goods to warehouse stock and marks order Completed.' }
      ];
    default:
      return [];
  }
}

function getModuleOutcome(name) {
  switch (name) {
    case 'dashboard':
      return 'Complete real-time operational visibility and 1-click approval clearance for managers.';
    case 'sites':
      return 'Multi-facility structure established; materials assigned to warehouses without duplicate records.';
    case 'masters':
      return 'Central foundation ready with materials, vendor pricing, and exact BOM recipe specifications.';
    case 'inventory':
      return 'Physical inventory updated with full audit trail; non-admin adjustments queued for approval.';
    case 'planning':
      return 'Material shortages identified; planned orders generated based on real-time stock and BOM recipes.';
    case 'scheduling':
      return 'Planned orders committed into scheduled dates; component stock reserved for execution.';
    case 'production':
      return 'Finished goods produced and credited to inventory; raw materials consumed; job completed.';
    default:
      return 'Operational execution completed.';
  }
}

captureAndGeneratePdf().catch(err => {
  console.error('❌ Failed to generate screenshot PDF report:', err);
  process.exit(1);
});
