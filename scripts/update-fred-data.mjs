import fs from "fs/promises";

const CONFIG_PATH = "data/market-config.json";
const OUTPUT_PATH = "data/market-data.json";

function parseFredCsv(csvText, seriesId) {
  const lines = csvText.trim().split(/\r?\n/);

  if (lines.length < 2) {
    throw new Error(`FRED returned no rows for ${seriesId}`);
  }

  const rows = lines
    .slice(1)
    .map((line) => {
      const [date, value] = line.split(",");
      return { date, value };
    })
    .filter((row) => row.value && row.value !== "." && !Number.isNaN(Number(row.value)));

  if (!rows.length) {
    throw new Error(`No valid values found for ${seriesId}`);
  }

  const latest = rows[rows.length - 1];
  const previousYear = rows.length >= 13 ? rows[rows.length - 13] : null;

  return {
    latestDate: latest.date,
    medianDaysOnMarket: Math.round(Number(latest.value)),
    previousYearDate: previousYear ? previousYear.date : null,
    previousYearDaysOnMarket: previousYear ? Math.round(Number(previousYear.value)) : null,
  };
}

async function main() {
  const configText = await fs.readFile(CONFIG_PATH, "utf8");
  const config = JSON.parse(configText);

  const markets = [];

  for (const market of config.markets) {
    const fredUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(
      market.seriesId
    )}`;

    console.log(`Fetching ${market.marketName}: ${market.seriesId}`);

    const response = await fetch(fredUrl);

    if (!response.ok) {
      throw new Error(`Could not fetch ${market.seriesId}: ${response.status}`);
    }

    const csvText = await response.text();
    const parsed = parseFredCsv(csvText, market.seriesId);

    markets.push({
      marketName: market.marketName,
      state: market.state,
      seriesId: market.seriesId,
      sourceName: market.sourceName,
      sourceUrl: market.sourceUrl,
      cities: market.cities,
      ...parsed,
    });
  }

  const output = {
    brand: config.brand,
    updatedAt: new Date().toISOString(),
    markets,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
