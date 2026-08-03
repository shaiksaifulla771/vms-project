import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const url = 'https://github.com/shaiksaifulla771/vms-project/actions/runs/30612877436/job/91099428737';
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle2' });
  
  // Wait for the step 8 to be visible.
  console.log("Waiting for step 8...");
  // Step 8 is "Run backend automated test suite"
  // It has a check-step element
  // We can just click to expand it if it's not expanded, or we can just extract all text in the logs.
  try {
    await page.waitForSelector('.log-line', { timeout: 15000 });
    const logLines = await page.$$eval('.log-line', lines => lines.map(l => l.innerText).join('\n'));
    console.log("--- LOGS ---");
    console.log(logLines);
  } catch(e) {
    console.log("Could not find .log-line");
    // Fallback: extract the whole page text
    const text = await page.evaluate(() => document.body.innerText);
    console.log("--- RAW TEXT ---");
    console.log(text.substring(0, 10000)); // print first 10k chars
  }

  await browser.close();
})();
