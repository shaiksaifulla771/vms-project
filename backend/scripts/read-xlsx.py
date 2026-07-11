import zipfile
import xml.etree.ElementTree as ET
import os

xlsx_path = r"C:\Users\DELL\Downloads\Materials_Vendors_V6e - Copy.xlsx"

def parse_xlsx(file_path):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    try:
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            # 1. Read shared strings
            shared_strings = []
            if 'xl/sharedStrings.xml' in zip_ref.namelist():
                ss_data = zip_ref.read('xl/sharedStrings.xml')
                root = ET.fromstring(ss_data)
                # Excel shared strings format is <sst><si><t>Text</t></si></sst>
                for si in root.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                    t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    if t is not None:
                        shared_strings.append(t.text)
                    else:
                        # Sometimes text is rich text in <r> elements
                        t_parts = []
                        for r in si.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}r'):
                            rt = r.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                            if rt is not None and rt.text:
                                t_parts.append(rt.text)
                        shared_strings.append("".join(t_parts))

            # 2. Find sheets
            sheets = []
            for name in zip_ref.namelist():
                if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                    sheets.append(name)

            print(f"Found sheets: {sheets}")
            print(f"Total Shared Strings: {len(shared_strings)}")

            # 3. Parse sheets
            for sheet_name in sorted(sheets):
                print(f"\n--- PARSING {sheet_name} ---")
                sheet_data = zip_ref.read(sheet_name)
                root = ET.fromstring(sheet_data)
                
                rows = {}
                for row in root.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                    row_idx = int(row.get('r'))
                    row_cells = []
                    
                    for c in row.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                        cell_ref = c.get('r')
                        cell_type = c.get('t')
                        val_el = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        
                        val = ""
                        if val_el is not None:
                            raw_val = val_el.text
                            if cell_type == 's' and raw_val is not None:
                                try:
                                    val = shared_strings[int(raw_val)]
                                except IndexError:
                                    val = f"[String Index Error: {raw_val}]"
                            else:
                                val = raw_val
                        row_cells.append((cell_ref, val))
                    rows[row_idx] = row_cells
                
                # Print first 20 rows of sheet
                for r_idx in sorted(rows.keys())[:25]:
                    cells_str = ", ".join([f"{ref}:{val}" for ref, val in rows[r_idx]])
                    print(f"Row {r_idx}: {cells_str}")

    except Exception as e:
        print("Error parsing Excel zip:", str(e))

parse_xlsx(xlsx_path)
