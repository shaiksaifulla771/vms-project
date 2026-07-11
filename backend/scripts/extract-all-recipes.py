import zipfile
import xml.etree.ElementTree as ET
import os
import json

xlsx_path = r"C:\Users\DELL\Downloads\Materials_Vendors_V6e - Copy.xlsx"

def extract_all(file_path):
    if not os.path.exists(file_path):
        print("Excel not found.")
        return

    with zipfile.ZipFile(file_path, 'r') as zip_ref:
        # Parse shared strings
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

        # We will parse sheets from sheet9.xml onwards
        recipe_sheets = []
        for name in sorted(zip_ref.namelist()):
            if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                num = int("".join([c for c in name if c.isdigit()]))
                # Filter out master sheets (sheet1 = category list, sheet2 = vendors list, sheet4, 6, 7 = general)
                if num >= 9 and num not in [22, 23, 24]:
                    recipe_sheets.append(name)

        all_products = []
        all_vendors_set = set()
        all_raw_materials_set = {} # name -> {unit, price, vendor}

        for sheet in recipe_sheets:
            data = zip_ref.read(sheet)
            root = ET.fromstring(data)
            
            # Read rows
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

            # 1. Product Name from Cell A1
            product_name = rows.get(1, {}).get('A', '').strip()
            # Product Code from Cell D1 (or fallback)
            product_code = rows.get(1, {}).get('D', '').strip()
            
            if not product_name:
                continue

            if not product_code:
                product_code = "FG-" + "".join([c for c in product_name.upper() if c.isalnum() or c==' ']).replace(' ', '-')[:12]
            else:
                product_code = "FG-" + product_code.upper()

            # Ensure code uniqueness to handle duplicate entries in the source Excel file
            base_code = product_code
            dup_suffix = 1
            while any(p['code'] == product_code for p in all_products):
                dup_suffix += 1
                product_code = f"{base_code}_{dup_suffix}"

            print(f"Parsing recipe for Finished Good: {product_name} ({product_code})")

            # Parse ingredients (starts from row 5, ends when Material Name is empty or Total row is met)
            components = []
            for r_idx in range(5, 50):
                row_data = rows.get(r_idx, {})
                mat_name = row_data.get('B', '').strip()
                vendor = row_data.get('C', '').strip()
                qty = row_data.get('D', '0')
                unit = row_data.get('E', 'Kg').strip()
                price = row_data.get('H', '0')

                # Stop conditions
                if not mat_name or mat_name == "Total" or "obtained" in mat_name.lower():
                    break

                # Normalize quantities
                if unit == 'No':
                    unit = 'pcs'

                if vendor == "No Vendor Identified" or not vendor:
                    vendor = "Local Spot Market"

                try:
                    qty_val = float(qty) if qty else 0.0
                except ValueError:
                    qty_val = 0.0

                try:
                    price_val = float(price) if price else 0.0
                except ValueError:
                    price_val = 0.0

                # Skip blank quantities
                if qty_val == 0.0 and mat_name != "Ponni Rice":
                    continue

                # Generate code for raw material
                rm_code = "RM-" + "".join([c for c in mat_name.upper() if c.isalnum() or c==' ']).replace(' ', '-')[:16]

                components.append({
                    'name': mat_name,
                    'code': rm_code,
                    'quantity': qty_val,
                    'unit': unit,
                    'vendor': vendor
                })

                # Register globally to seed
                all_vendors_set.add(vendor)
                all_raw_materials_set[rm_code] = {
                    'name': mat_name,
                    'unit': unit,
                    'price': price_val,
                    'vendor': vendor
                }

            all_products.append({
                'name': product_name,
                'code': product_code,
                'components': components
            })

        # Save to JSON file
        out_dir = r"C:\Users\DELL\.gemini\antigravity\scratch\vms-project\backend\config"
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "all_recipes.json")
        
        output_data = {
            'vendors': list(all_vendors_set),
            'raw_materials': all_raw_materials_set,
            'finished_goods': all_products
        }

        with open(out_path, 'w') as f:
            json.dump(output_data, f, indent=2)

        print(f"\nExtraction completed! Saved to {out_path}")
        print(f"Total Vendors Extracted: {len(all_vendors_set)}")
        print(f"Total Raw Materials Extracted: {len(all_raw_materials_set)}")
        print(f"Total Finished Goods Extracted: {len(all_products)}")

extract_all(xlsx_path)
