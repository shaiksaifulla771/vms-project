const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const data = [
  {
    vendorId: "V1010",
    name: "Acme Corp",
    company: "Acme Enterprises",
    email: "acme@example.com",
    phone: "1234567890",
    address: "123 Street",
    address2: "Suite 100",
    zipCode: "10001",
    city: "New York",
    state: "NY",
    country: "USA",
    gstin: "22AAAAA0000A1Z5",
    category: "Other",
    subCategory: "Packaging",
    notes: "Sample notes"
  }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Vendors");

const filePath = path.join(__dirname, 'public', 'vendor_template.xlsx');
XLSX.writeFile(wb, filePath);
console.log('Template created at:', filePath);
