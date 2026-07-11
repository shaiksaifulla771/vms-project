import zipfile
import xml.etree.ElementTree as ET
import os

xlsx_path = r"C:\Users\DELL\Downloads\Materials_Vendors_V6e - Copy.xlsx"

def scan_sheets(file_path):
    if not os.path.exists(file_path):
        print("Excel not found.")
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

        # Check all worksheets
        for name in sorted(zip_ref.namelist()):
            if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                data = zip_ref.read(name)
                root = ET.fromstring(data)
                
                # Check cell A1 to see if it represents a cost card/sheet
                a1_val = ""
                for c in root.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    if c.get('r') == 'A1':
                        cell_type = c.get('t')
                        v_el = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        if v_el is not None:
                            val = v_el.text
                            if cell_type == 's' and val is not None:
                                try:
                                    a1_val = shared_strings[int(val)]
                                except IndexError:
                                    a1_val = val
                            else:
                                a1_val = val
                        break
                
                if a1_val:
                    print(f"{name}: cell A1 = '{a1_val.strip()}'")

scan_sheets(xlsx_path)
