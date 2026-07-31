
import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  try {
    await page.goto("http://localhost:3001/boms", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
    
    // Type in the search box by focusing the first text input
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const searchBox = inputs.find(i => i.placeholder && i.placeholder.includes("Search BOM"));
      if (searchBox) {
        searchBox.value = "Test";
        searchBox.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    
    await new Promise(r => setTimeout(r, 500));
    
    // Screenshot of Clear Filters button visible
    await page.screenshot({ path: "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\27c6715a-24ed-44c3-b20e-bbf2fad270b4\\clear_filters.png", fullPage: true });

    console.log("Filter screenshot taken successfully!");
  } catch (error) {
    console.error("Error taking screenshot:", error);
  } finally {
    await browser.close();
  }
})();

