import urllib.request
import ssl

url = "https://lywo365-my.sharepoint.com/:x:/r/personal/developer_lywo_in/_layouts/15/Doc.aspx?sourcedoc=%7B3F621400-C9D7-4545-AECC-E79256521286%7D&file=Materials_Vendors_V6e%20-%20Copy.xlsx&action=default&mobileredirect=true"

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

req = urllib.request.Request(url, headers=headers)
context = ssl._create_unverified_context()

try:
    print("Requesting SharePoint URL...")
    with urllib.request.urlopen(req, context=context, timeout=10) as response:
        info = response.info()
        print("Response Code:", response.getcode())
        print("Content Type:", info.get_content_type())
        html = response.read(1000).decode('utf-8', errors='ignore')
        print("Initial HTML bytes:\n", html)
except Exception as e:
    print("Failed to download:", str(e))
