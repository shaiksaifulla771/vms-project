import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  try {
    await page.goto("http://localhost:3001/boms", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
    
    // 1. Screenshot of Active tab
    await page.screenshot({ path: "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\27c6715a-24ed-44c3-b20e-bbf2fad270b4\\active_tab.png", fullPage: true });

    // 2. Click "Deleted" tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const deletedBtn = buttons.find(b => b.textContent === "Deleted");
      if (deletedBtn) deletedBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    
    // Screenshot of Deleted tab (Bug 1 fix)
    await page.screenshot({ path: "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\27c6715a-24ed-44c3-b20e-bbf2fad270b4\\deleted_tab.png", fullPage: true });

    // Go back to Active
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const activeBtn = buttons.find(b => b.textContent === "Active");
      if (activeBtn) activeBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 3. Test Select Mode & Edit Selected (Bug 2 fix)
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll("label"));
      const selectModeLabel = labels.find(l => l.textContent === "Select Mode");
      if (selectModeLabel) selectModeLabel.click();
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Click the first checkbox in the table body
    await page.evaluate(() => {
      const tbody = document.querySelector("tbody");
      if (tbody) {
        const firstCheckbox = tbody.querySelector("input[type='checkbox']");
        if (firstCheckbox) firstCheckbox.click();
      }
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Screenshot of Edit in Select Mode
    await page.screenshot({ path: "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\27c6715a-24ed-44c3-b20e-bbf2fad270b4\\edit_select_mode.png", fullPage: true });

    // 4. Test Clear Filters (Bug 3 fix)
    // Type in search bar
    await page.type("input[placeholder='Search BOM by product name or code...']", "Test");
    await new Promise(r => setTimeout(r, 500));
    
    // Screenshot of Clear Filters button visible
    await page.screenshot({ path: "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\27c6715a-24ed-44c3-b20e-bbf2fad270b4\\clear_filters.png", fullPage: true });

    console.log("Screenshots taken successfully!");
  } catch (error) {
    console.error("Error taking screenshot:", error);
  } finally {
    await browser.close();
  }
})();
