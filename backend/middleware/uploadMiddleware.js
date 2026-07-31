const multer = require('multer');
const path = require('path');

// Configure memory storage for direct buffer processing
const storage = multer.memoryStorage();

// Allowed file extensions & mime types for spreadsheet upload
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/x-csv',
  'application/x-csv',
  'text/comma-separated-values',
  'text/x-comma-separated-values',
  'application/octet-stream'
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const isValidExt = ALLOWED_EXTENSIONS.includes(ext);
  const isValidMime = ALLOWED_MIME_TYPES.includes(mime);

  if (!isValidExt) {
    const err = new Error(`Invalid file type '${ext}'. Only spreadsheet files (.xlsx, .xls, .csv) are allowed.`);
    err.statusCode = 400;
    return cb(err, false);
  }

  if (!isValidMime) {
    const err = new Error(`Invalid file format '${file.mimetype}'. Please upload a valid spreadsheet file.`);
    err.statusCode = 400;
    return cb(err, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum file size limit
  },
  fileFilter,
});

module.exports = upload;
