const fs = require("fs");
const path = "./src/pages/BOM.jsx";
let code = fs.readFileSync(path, "utf8");

// 1. Add state for statusFilter, isSelectMode, selectedBoms
const stateOld = `  const [error, setError] = useState(null);

  // Search & Filter state`;
const stateNew = `  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('Active');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedBoms, setSelectedBoms] = useState([]);

  // Search & Filter state`;
code = code.replace(stateOld, stateNew);

// 2. Update fetchBOMs
const fetchOld = `      const [resBoms, resMaterials] = await Promise.all([
        api.get('/api/boms'),
        api.get('/api/materials')
      ]);`;
const fetchNew = `      const [resBoms, resMaterials] = await Promise.all([
        api.get(\`/api/boms?status=\${statusFilter}\`),
        api.get('/api/materials')
      ]);`;
code = code.replace(fetchOld, fetchNew);

// 3. Trigger fetchBOMs on statusFilter change and clear selected
const effectOld = `  useEffect(() => {
    fetchBOMs();
  }, []);`;
const effectNew = `  useEffect(() => {
    fetchBOMs();
    setSelectedBoms([]);
  }, [statusFilter]);`;
code = code.replace(effectOld, effectNew);

// 4. Add bulk handlers
const handlersOld = `  const handleDeleteBOM = async (id) => {`;
const handlersNew = `  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedBoms(filteredBoms.map(b => b._id));
    } else {
      setSelectedBoms([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedBoms(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(\`Soft delete \${selectedBoms.length} BOM(s)?\`)) return;
    try {
      await api.post('/api/boms/bulk-delete', { ids: selectedBoms });
      setSelectedBoms([]);
      fetchBOMs();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to bulk delete' );
    }
  };

  const handleBulkRestore = async () => {
    if (!window.confirm(\`Restore \${selectedBoms.length} BOM(s)?\`)) return;
    try {
      await api.post('/api/boms/bulk-restore', { ids: selectedBoms });
      setSelectedBoms([]);
      fetchBOMs();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to bulk restore' );
    }
  };

  const handleDeleteBOM = async (id) => {`;
code = code.replace(handlersOld, handlersNew);

// 5. Update top banner UI
const bannerOld = `          <Button onClick={handleOpenAddModal} className="flex items-center space-x-1 w-full md:w-auto shrink-0 justify-center">
            <Plus className="h-4 w-4" />
            <span>Define BOM</span>
          </Button>`;
const bannerNew = `          <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full md:w-auto shrink-0">
            <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
              <button
                onClick={() => setStatusFilter('Active')}
                className={\`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all \${statusFilter === 'Active' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('Deleted')}
                className={\`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all \${statusFilter === 'Deleted' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}
              >
                Deleted
              </button>
            </div>
            {statusFilter === 'Active' && (
              <Button onClick={handleOpenAddModal} className="flex items-center space-x-1 w-full sm:w-auto justify-center">
                <Plus className="h-4 w-4" />
                <span>Define BOM</span>
              </Button>
            )}
          </div>`;
code = code.replace(bannerOld, bannerNew);

// 6. Bulk Action Bar
const tableContainerOld = `      {/* Main Grid table */}
      <Card>
        <CardContent className="p-0">`;
const tableContainerNew = `      {/* Main Grid table */}
      <Card>
        {isSelectMode && (
          <div className="bg-blue-50 border-b border-blue-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-blue-800">{selectedBoms.length} BOM(s) selected</span>
            </div>
            <div className="flex items-center space-x-2">
              {statusFilter === 'Active' && (
                <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={selectedBoms.length === 0} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
                  <Trash2 className="h-4 w-4 mr-1" /> Soft Delete Selected
                </Button>
              )}
              {statusFilter === 'Deleted' && (
                <Button size="sm" onClick={handleBulkRestore} disabled={selectedBoms.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent">
                  Restore Selected
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="px-4 py-2 border-b border-slate-100 flex justify-end bg-slate-50">
          <label className="flex items-center space-x-2 text-sm font-semibold text-slate-700 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isSelectMode} 
              onChange={(e) => {
                setIsSelectMode(e.target.checked);
                if (!e.target.checked) setSelectedBoms([]);
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span>Select Mode</span>
          </label>
        </div>
        <CardContent className="p-0">`;
code = code.replace(tableContainerOld, tableContainerNew);

// 7. Table Header
const tableHeaderOld = `              <TableHeader>
                <TableRow>
                  <TableHead>Assembly Product</TableHead>`;
const tableHeaderNew = `              <TableHeader>
                <TableRow>
                  {isSelectMode && (
                    <TableHead className="w-12 text-center">
                      <input 
                        type="checkbox" 
                        checked={filteredBoms.length > 0 && selectedBoms.length === filteredBoms.length}
                        onChange={handleSelectAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </TableHead>
                  )}
                  <TableHead>Assembly Product</TableHead>`;
code = code.replace(tableHeaderOld, tableHeaderNew);

// 8. Table Row Data (Checkbox + MPN rendering + Edit logic)
const tableRowOld = `                {filteredBoms.map((bom) => (
                  <TableRow key={bom._id}>
                    <TableCell className="font-bold text-slate-800">`;
const tableRowNew = `                {filteredBoms.map((bom) => (
                  <TableRow key={bom._id} className={selectedBoms.includes(bom._id) ? 'bg-blue-50/50' : ''}>
                    {isSelectMode && (
                      <TableCell className="text-center">
                        <input 
                          type="checkbox"
                          checked={selectedBoms.includes(bom._id)}
                          onChange={() => handleSelectOne(bom._id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-bold text-slate-800">`;
code = code.replace(tableRowOld, tableRowNew);

// 9. Components mapping (MPN rendering)
const compOld = `                              <div key={idx} className={\`border rounded-lg px-2 py-0.5 text-[11px] flex items-center \${missingPrice ? 'bg-amber-50/80 border-amber-300 text-amber-700' : 'bg-slate-100/80 border-slate-200/50 text-slate-600'}\`}>
                                {missingPrice && <span className="mr-1" title="Price not set">⚠</span>}
                                <span className="font-bold">{comp.materialId?.name || 'Material'}</span>
                                <span className={\`font-bold ml-1.5 \${missingPrice ? 'text-amber-600' : 'text-blue-600'}\`}>
                                  {comp.quantity} {comp.materialId?.unit || ''}
                                </span>
                              </div>`;
const compNew = `                              <div key={idx} className={\`border rounded-lg px-2 py-1 text-[11px] flex flex-col \${missingPrice ? 'bg-amber-50/80 border-amber-300 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-700'}\`}>
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center">
                                    {missingPrice && <span className="mr-1 text-amber-600 font-bold" title="Price not set">⚠</span>}
                                    <span className="font-bold">{comp.materialId?.name || 'Material'}</span>
                                  </div>
                                  <span className={\`font-bold ml-3 \${missingPrice ? 'text-amber-600' : 'text-blue-700'}\`}>
                                    {comp.quantity} {comp.materialId?.unit || ''}
                                  </span>
                                </div>
                                {comp.mpnUsed && (
                                  <div className="text-[9px] text-slate-500 mt-0.5 font-medium flex items-center justify-between w-full">
                                    <span className="truncate max-w-[120px]">{comp.mpnUsed.vendorName}</span>
                                    <span className="font-mono text-slate-400 bg-white px-1 border border-slate-100 rounded ml-2">{comp.mpnUsed.partNumber}</span>
                                  </div>
                                )}
                              </div>`;
code = code.replace(compOld, compNew);

// 10. Edit / Delete logic conditionally rendered on Active
const actionsOld = `                        <button
                          onClick={() => handleOpenEditModal(bom)}
                          title="Edit components"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        
                        <button
                          onClick={() => handleDeleteBOM(bom._id)}
                          title="Delete recipe"
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>`;
const actionsNew = `                        {statusFilter === 'Active' && (
                          <>
                            <button
                              onClick={() => handleOpenEditModal(bom)}
                              title="Edit components"
                              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBOM(bom._id)}
                              title="Delete recipe"
                              className="p-1.5 rounded-md hover:bg-red-50 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}`;
code = code.replace(actionsOld, actionsNew);

fs.writeFileSync(path, code);
console.log("Frontend BOM.jsx patched successfully!");
