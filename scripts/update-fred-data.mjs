import fs from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import zlib from "zlib";
import readline from "readline";

const CONFIG_PATH = "data/market-config.json";
const OUTPUT_PATH = "data/market-data.json";

const REDFIN_CITY_DATA_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/city_market_tracker.tsv000.gz";

const TARGET_STATE = "OK";

const BRAND_DEFAULTS = {
  name: "Your Home Sold Guaranteed Realty – Kerr Team",
  phone: "330-3000",
  textKeyword: "VALUE",
  website: "kerrteam.com"
};

function clean(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  const cleaned = clean(value).replace(/[$,%]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeCityName(value) {
  return clean(value)
    .replace(/, Oklahoma$/i, "")
    .replace(/, OK$/i, "")
    .trim();
}

function getSpeed(days) {
  const n = Number(days);
  if (n <= 49) return "Fast";
  if (n >= 50 && n <= 60) return "Normal";
  return "Slower";
}

function getHeaderValue(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }
  return "";
}

function parseTsvLine(line) {
  return line.split("\t");
}

function buildRow(headers, values) {
  const row = {};
  headers.forEach((header, index) => {
    row[header] = values[index] ?? "";
  });
  return row;
}

function pickBestRowsByCity(rows) {
  const latestByCity = new Map();

  for (const row of rows) {
    const city = row.cityName;
    const existing = latestByCity.get(city);

    if (!existing) {
      latestByCity.set(city, row);
      continue;
    }

    if (row.periodEnd > existing.periodEnd) {
      latestByCity.set(city, row);
    }
  }

  return Array.from(latestByCity.values()).sort((a, b) =>
    a.cityName.localeCompare(b.cityName)
  );
}

async function fetchRedfinCityData() {
  console.log("Fetching Redfin city-level housing market data...");

  const response = await fetch(REDFIN_CITY_DATA_URL);

  if (!response.ok || !response.body) {
    throw new Error(`Redfin city data failed: ${response.status}`);
  }

  const nodeStream = Readable.fromWeb(response.body);
  const gunzip = zlib.createGunzip();

  const lineReader = readline.createInterface({
    input: nodeStream.pipe(gunzip),
    crlfDelay: Infinity
  });

  let headers = null;
  const allOklahomaRows = [];

  for await (const line of lineReader) {
    if (!line || !line.trim()) continue;

    if (!headers) {
      headers = parseTsvLine(line);
      continue;
    }

    const values = parseTsvLine(line);
    const row = buildRow(headers, values);

    const stateCode = clean(
      getHeaderValue(row, ["state_code", "state", "stateCode"])
    );

    if (stateCode !== TARGET_STATE) continue;

    const propertyType = clean(
      getHeaderValue(row, ["property_type", "propertyType"])
    ).toLowerCase();

    const periodDuration = clean(
      getHeaderValue(row, ["period_duration", "periodDuration"])
    );

    const isSeasonallyAdjusted = clean(
      getHeaderValue(row, ["is_seasonally_adjusted", "isSeasonallyAdjusted"])
    ).toLowerCase();

    if (propertyType && propertyType !== "all residential") continue;
    if (periodDuration && periodDuration !== "30") continue;
    if (isSeasonallyAdjusted === "true") continue;

    const rawCity =
      getHeaderValue(row, ["city", "region", "region_name", "regionName"]);

    const cityName = normalizeCityName(rawCity);

    if (!cityName) continue;

    const medianDaysOnMarket = toNumber(
      getHeaderValue(row, ["median_dom", "median_days_on_market", "medianDaysOnMarket"])
    );

    if (medianDaysOnMarket === null) continue;

    const medianDomYoy = toNumber(
      getHeaderValue(row, ["median_dom_yoy", "median_days_on_market_yoy", "medianDaysOnMarketYoy"])
    );

    const medianSalePrice = toNumber(
      getHeaderValue(row, ["median_sale_price", "medianSalePrice"])
    );

    const homesSold = toNumber(
      getHeaderValue(row, ["homes_sold", "homesSold"])
    );

    const periodEnd = clean(
      getHeaderValue(row, ["period_end", "periodEnd"])
    );

    const periodBegin = clean(
      getHeaderValue(row, ["period_begin", "periodBegin"])
    );

    let previousYearDaysOnMarket = null;

    if (medianDomYoy !== null) {
      previousYearDaysOnMarket = Math.round(medianDaysOnMarket - medianDomYoy);
    }

    allOklahomaRows.push({
      cityName,
      state: TARGET_STATE,
      marketName: `${cityName}, OK`,
      periodBegin,
      periodEnd,
      medianDaysOnMarket: Math.round(medianDaysOnMarket),
      previousYearDaysOnMarket,
      medianSalePrice,
      homesSold,
      speed: getSpeed(medianDaysOnMarket),
      sourceName: "Redfin Data Center",
      sourceUrl: "https://www.redfin.com/news/data-center/downloads/"
    });
  }

  const latestRows = pickBestRowsByCity(allOklahomaRows);

  if (!latestRows.length) {
    throw new Error("No Oklahoma city-level rows found in Redfin data.");
  }

  console.log(`Found ${latestRows.length} Oklahoma city-level Redfin markets.`);

  return latestRows.map((row) => ({
    marketName: row.marketName,
    state: row.state,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    latestDate: row.periodEnd || row.periodBegin,
    medianDaysOnMarket: row.medianDaysOnMarket,
    previousYearDaysOnMarket: row.previousYearDaysOnMarket,
    medianSalePrice: row.medianSalePrice,
    homesSold: row.homesSold,
    speed: row.speed,
    cities: [row.cityName]
  }));
}

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
    previousYearDaysOnMarket: previousYear ? Math.round(Number(previousYear.value)) : null
  };
}

async function fetchFredFallback(config) {
  console.log("Using FRED/Realtor.com metro fallback data...");

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
      sourceName: market.sourceName || "FRED / Realtor.com",
      sourceUrl: market.sourceUrl,
      cities: market.cities,
      ...parsed
    });
  }

  return markets;
}

async function main() {
  const configText = await fs.readFile(CONFIG_PATH, "utf8");
  const config = JSON.parse(configText);

  let markets = [];
  let dataMode = "redfin-city-level";

  try {
    markets = await fetchRedfinCityData();
  } catch (error) {
    console.warn("Redfin city-level data was not available.");
    console.warn(error.message);

    dataMode = "fred-metro-fallback";
    markets = await fetchFredFallback(config);
  }

  const output = {
    brand: {
      ...BRAND_DEFAULTS,
      ...(config.brand || {})
    },
    dataMode,
    updatedAt: new Date().toISOString(),
    markets
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Data mode: ${dataMode}`);
  console.log(`Markets written: ${markets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
