Kerr Team Home Days to Sell — Fully Automatic Version

WHAT THIS IS
This package creates an automated public data feed and a Squarespace embed that reads from it.

HOW IT WORKS
1. GitHub Actions runs once per month.
2. The update script downloads FRED/Realtor.com median-days-on-market data.
3. It writes market-data.json.
4. GitHub Pages makes market-data.json publicly readable.
5. The Squarespace code block fetches market-data.json each time someone opens the page.

IMPORTANT DATA NOTE
This first automatic version uses metro-level public data from FRED/Realtor.com.
For example, Norman, Edmond, Moore, Noble, Tuttle, Yukon, and Mustang map to the Oklahoma City Metro reading.
That is reliable and automatic, but it is not exact city-level MLS data.

FILES
- package.json
- scripts/update-fred-data.mjs
- data/market-config.json
- .github/workflows/update-market-data.yml
- squarespace/automatic-squarespace-embed.html

SETUP STEPS
1. Create a new GitHub repository, for example: home-days-to-sell-data
2. Upload all files in this folder to that repository.
3. In GitHub, go to Settings > Pages.
4. Enable GitHub Pages from the main branch.
5. Go to Actions and run "Update market data" manually once.
6. Confirm this file opens publicly:
   https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/market-data.json
7. Open squarespace/automatic-squarespace-embed.html.
8. Replace this line:
   https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/market-data.json
   with your real GitHub Pages data URL.
9. Copy the full Squarespace embed code into a Squarespace Code Block.

HOW TO ADD MORE MARKETS
Edit data/market-config.json.
Add a new market with:
- marketName
- state
- seriesId
- sourceName
- sourceUrl
- cities

Then run the GitHub Action again.

COMMON ISSUE
If the Squarespace page says "Setup needed," the DATA_URL inside the embed code is still pointing to the placeholder URL or GitHub Pages has not been enabled yet.
