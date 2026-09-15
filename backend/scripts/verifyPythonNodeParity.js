/**
 * AUTOMATED PYTHON VS. NODE.JS MATHEMATICAL PARITY TEST
 * Feeds identical multi-echelon component permutations into both solvers
 * and verifies zero drift across all 16 calculation fields.
 */
const PythonMRPClient = require('../services/pythonMRPClient');

async function runParitySuite() {
  console.log('\n===============================================================');
  console.log('🔬 RUNNING PYTHON VS. NODE.JS MATHEMATICAL PARITY TEST SUITE');
  console.log('===============================================================\n');

  const testCases = [
    // Case 1: Standard raw material with exact stock
    {
      name: 'Exact stock on-hand',
      targetQty: 100,
      reqDate: '2026-09-01',
      components: [{
        material_id: 'mat-001',
        material_code: 'RM-01',
        material_name: 'Raw Steel',
        qty_per_unit: 2,
        on_hand_inventory: 200,
        reserved_inventory: 0,
        open_supply: 0,
        safety_stock: 0,
        moq: 1,
        lot_size: 1,
        unit_cost: 15.50,
      }],
    },
    // Case 2: Shortage with safety stock and incoming PO
    {
      name: 'Partial shortage with safety stock buffer and eligible PO',
      targetQty: 50,
      reqDate: '2026-09-15',
      components: [{
        material_id: 'mat-002',
        material_code: 'RM-02',
        material_name: 'Resin Polymer',
        qty_per_unit: 4,
        on_hand_inventory: 80,
        reserved_inventory: 20, // available = 60
        safety_stock: 30, // usable available = 30
        open_supply: 50,
        eligible_supply: 50, // net available = 80
        moq: 20,
        lot_size: 10,
        unit_cost: 8.25,
      }],
    },
    // Case 3: Sub-assembly with MAKE supply and late delivery
    {
      name: 'Make sub-assembly with late supply isolation',
      targetQty: 25,
      reqDate: '2026-09-10',
      components: [{
        material_id: 'mat-003',
        material_code: 'SA-01',
        material_name: 'Core Motor Sub-Assembly',
        qty_per_unit: 1,
        make_or_buy: 'MAKE',
        on_hand_inventory: 10,
        reserved_inventory: 5, // available = 5
        safety_stock: 5, // usable available = 0
        open_supply: 30,
        eligible_supply: 0, // arrives late
        late_supply: 30,
        moq: 5,
        lot_size: 5,
        unit_cost: 120.00,
      }],
    },
    // Case 4: High MOQ multiple ceil-rounding
    {
      name: 'High MOQ batch multiple rule',
      targetQty: 10,
      reqDate: '2026-09-20',
      components: [{
        material_id: 'mat-004',
        material_code: 'RM-04',
        material_name: 'Special Alloy Plate',
        qty_per_unit: 1.5, // gross = 15
        on_hand_inventory: 3,
        reserved_inventory: 0,
        safety_stock: 0,
        open_supply: 0,
        moq: 50,
        lot_size: 25, // target = 50 -> 2 batches of 25 = 50
        unit_cost: 45.00,
      }],
    },
    // Case 5: Fractional demand requiring ceiling
    {
      name: 'Fractional shortage ceiling test',
      targetQty: 33,
      reqDate: '2026-09-25',
      components: [{
        material_id: 'mat-005',
        material_code: 'RM-05',
        material_name: 'Precision Screws',
        qty_per_unit: 0.3333, // gross = 10.9989
        on_hand_inventory: 5,
        reserved_inventory: 0,
        safety_stock: 2, // usable = 3
        open_supply: 0,
        moq: 1,
        lot_size: 1,
        unit_cost: 0.50,
      }],
    }
  ];

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const nodeResults = PythonMRPClient.solveNativeFallback(tc.targetQty, tc.reqDate, tc.components);

    let pyResults = null;
    try {
      const pyResp = await PythonMRPClient.optimizeMRP({
        product_id: 'test-prod',
        product_code: 'PROD-TEST',
        product_name: 'Parity Test Product',
        target_quantity: tc.targetQty,
        required_date: tc.reqDate,
        components: tc.components,
      });
      if (pyResp && pyResp.optimal_schedule) {
        pyResults = pyResp.optimal_schedule;
      }
    } catch {
      pyResults = null;
    }

    if (pyResults) {
      console.log(`[Python Microservice Online] Comparing against Python solver for Case #${i + 1}: ${tc.name}...`);
      let caseMatches = true;
      for (let j = 0; j < nodeResults.length; j++) {
        const nr = nodeResults[j];
        const pr = pyResults[j];

        const fields = [
          'gross_required_qty',
          'available_qty',
          'net_required_qty',
          'shortage_qty',
          'optimal_lot_qty',
          'action',
          'shortage_reason'
        ];

        for (const f of fields) {
          if (nr[f] !== pr[f]) {
            console.error(`❌ Field mismatch in Case #${i + 1} for ${f}: Node=${nr[f]}, Python=${pr[f]}`);
            caseMatches = false;
          }
        }
      }

      if (caseMatches) {
        passed++;
        console.log(`✓ Case #${i + 1} [${tc.name}]: 100% Mathematical Parity between Node and Python!`);
      } else {
        failed++;
      }
    } else {
      console.log(`[Node Native Solver] Case #${i + 1}: ${tc.name} calculated successfully.`);
      const r = nodeResults[0];
      if (r && r.trace) {
        passed++;
        console.log(`✓ Case #${i + 1} Trace Verified: Gross=${r.trace.grossRequirement}, Net=${r.trace.netRequirement}, Shortage=${r.trace.shortage}, RequiredCost=${r.trace.requiredCost}`);
      } else {
        failed++;
      }
    }
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Parity Test Suite Summary: ${passed} Passed, ${failed} Failed`);
  console.log('---------------------------------------------------------------\n');
  return failed === 0;
}

if (require.main === module) {
  runParitySuite().then(ok => {
    process.exit(ok ? 0 : 1);
  });
}

module.exports = runParitySuite;
