import zipfile
import xml.etree.ElementTree as ET
import os

xlsx_path = r"C:\Users\DELL\Downloads\Materials_Vendors_V6e - Copy.xlsx"

def extract_erp_data(file_path):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    with zipfile.ZipFile(file_path, 'r') as zip_ref:
        # 1. Parse shared strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in zip_ref.namelist():
            ss_data = zip_ref.read('xl/sharedStrings.xml')
            root = ET.fromstring(ss_data)
            for si in root.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                if t is not None:
                    shared_strings.append(t.text)
                else:
                    t_parts = []
                    for r in si.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}r'):
                        rt = r.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                        if rt is not None and rt.text:
                            t_parts.append(rt.text)
                    shared_strings.append("".join(t_parts))

        # We will scan sheet9.xml which has the Rice-O-Lentil cost card
        sheet_data = zip_ref.read('xl/worksheets/sheet9.xml')
        root = ET.fromstring(sheet_data)
        
        rows = {}
        for row in root.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
            row_idx = int(row.get('r'))
            cells = {}
            for c in row.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                ref = c.get('r')
                col_letter = "".join([char for char in ref if char.isalpha()])
                cell_type = c.get('t')
                val_el = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                
                val = ""
                if val_el is not None:
                    raw_val = val_el.text
                    if cell_type == 's' and raw_val is not None:
                        try:
                            val = shared_strings[int(raw_val)]
                        except IndexError:
                            val = raw_val
                    else:
                        val = raw_val
                cells[col_letter] = val
            rows[row_idx] = cells

        # Gather materials and vendors
        extracted_materials = []
        extracted_vendors = set()
        
        # Rows 5 to 18 contain the materials list
        for r_idx in range(5, 19):
            row_data = rows.get(r_idx, {})
            if 'B' in row_data and 'C' in row_data:
                name = row_data['B']
                vendor = row_data['C']
                qty = row_data.get('D', '0')
                unit = row_data.get('E', 'Kg')
                price = row_data.get('H', '0')
                
                # Normalize unit
                if unit == 'No':
                    unit = 'pcs'
                
                # Check for "No Vendor Identified"
                if vendor == "No Vendor Identified" or not vendor.strip():
                    vendor = "Local Spot Market"
                
                extracted_materials.append({
                    'name': name,
                    'vendor': vendor,
                    'qty': float(qty) if qty else 0.0,
                    'unit': unit,
                    'price': float(price) if price else 0.0
                })
                extracted_vendors.add(vendor)

        print("--- EXTRACTED VENDORS ---")
        for v in sorted(extracted_vendors):
            print(f"Vendor: {v}")
            
        print("\n--- EXTRACTED MATERIALS ---")
        for m in extracted_materials:
            print(m)

extract_erp_data(xlsx_path)
