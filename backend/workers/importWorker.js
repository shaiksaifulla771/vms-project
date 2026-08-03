const mongoose = require('mongoose');
const Staging = require('../models/Staging');
const { storage } = require('../storage');
const xlsx = require('xlsx');

/**
 * Worker that downloads a file from Object Storage, streams/parses it,
 * performs validation, and writes rows to the Staging collection.
 */
module.exports = async function importProcessor(job) {
  const { fileName, entityType } = job.data;
  
  if (!fileName || !entityType) {
    throw new Error('fileName and entityType are required job data.');
  }

  await job.updateProgress(10);
  
  // 1. Download file from Object Storage
  const fileBuffer = await storage.download(fileName);
  await job.updateProgress(30);

  // 2. Parse Excel/CSV
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Read rows as JSON
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
  await job.updateProgress(50);

  // 3. Validate and insert into Staging in chunks
  const CHUNK_SIZE = 500;
  let rowNumber = 1; // 1-indexed based on data rows (header is 0)
  
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    
    const stagingDocs = chunk.map(row => {
      const { parsedData, validationErrors } = validateRow(entityType, row);
      
      return {
        jobId: job.id,
        entityType,
        rowNumber: rowNumber++,
        rawData: row,
        parsedData,
        validationErrors,
        status: 'pending'
      };
    });

    await Staging.insertMany(stagingDocs);
    await job.updateProgress(50 + Math.floor(((i + chunk.length) / rows.length) * 50));
  }

  return { 
    status: 'parsed_and_staged',
    totalRows: rows.length
  };
};

/**
 * Basic validation logic based on entityType.
 * In a real app, you would expand this significantly.
 */
function validateRow(entityType, rawRow) {
  const validationErrors = [];
  let parsedData = { ...rawRow }; // Shallow copy

  if (entityType === 'Vendor') {
    if (!rawRow['Name'] && !rawRow['Vendor Name']) validationErrors.push({ field: 'Name', message: 'Vendor Name is required' });
    if (!rawRow['Email']) validationErrors.push({ field: 'Email', message: 'Email is required' });
    // Normalize keys to schema
    parsedData = {
      name: rawRow['Name'] || rawRow['Vendor Name'],
      company: rawRow['Company'] || '',
      email: rawRow['Email'],
      phone: rawRow['Phone'] || rawRow['Mobile'] || '',
      address: rawRow['Address'] || '',
      category: rawRow['Category'] || 'Other',
      status: 'Active'
    };
  } else if (entityType === 'Material') {
    if (!rawRow['Name']) validationErrors.push({ field: 'Name', message: 'Material Name is required' });
    // ... material specific parsing
  }

  return { parsedData, validationErrors };
}
