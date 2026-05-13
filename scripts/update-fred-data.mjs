import fs from "fs/promises";
import { Readable } from "stream";
import zlib from "zlib";
import readline from "readline";

const CONFIG_PATH = "data/market-config.json";
const OUTPUT_PATH = "data/market-data.json";

const REDFIN_CITY_DATA_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/city_market_tracker.tsv000.gz";

const BRAND_DEFAULTS = {
  name: "Your Home Sold Guaranteed Realty – Kerr Team",
  phone: "330-3000",
  textKeyword: "VALUE",
  website: "kerrteam.com"
};

const TARGET_CITIES = [
  "Edmond",
  "Moore",
  "Mustang",
  "Norman",
  "Oklahoma City",
  "Yukon",
  "Noble",
  "Tuttle",
  "Tulsa",
  "Lawton",
  "Enid",
  "Stillwater",
  "Broken Arrow",
  "Midwest City",
  "Del City",
  "Bethany",
  "Piedmont",
  "Blanchard"
];

function stripQuotes(value) {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "");
}

function normalizeHeader(value) {
  return stripQuotes(value)
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function clean(value) {
  return stripQuotes(value);
}

function toNumber(value) {
  const cleaned = clean(value).replace(/[$,%]/g, "");
  if (!cleaned || cleaned.toUpperCase() === "NA") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseTsvLine(line) {
  return line.split("\t").map(stripQuotes);
}

function buildRow(headers, values) {
  const row = {};
  headers.forEach((header, index) => {
    row[normalizeHeader(header)] = values[index] ?? "";
  });
  return row;
}

function getSpeed(days) {
  const n = Number(days);
  if (n <= 49) return "Fast";
  if (n >= 50 && n <= 60) return "Normal";
  return "Slower";
}

function pickLatestRowsByCity(rows) {
  const latestByCity = new Map();

  for (const row of rows) {
    const existing = latestByCity.get(row.cityName);

    if (!existing || row.periodEnd > existing.periodEnd) {
      latestByCity.set(row.cityName, row);
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
  const matchedRows = [];

  let scannedRows = 0;
  let oklahomaRows = 0;
  let targetCityRows = 0;
  let usableRows = 0;

  for await (const line of lineReader) {
    if (!line || !line.trim()) continue;

    if (!headers) {
      headers = parseTsvLine(line);
      console.log("Redfin headers found:");
      console.log(headers.join(", "));
      continue;
    }

    scannedRows++;

    const values = parseTsvLine(line);
    const row = buildRow(headers, values);

    const cityName = clean(row.city);
    const stateCode = clean(row.state_code);
    const regionType = clean(row.region_type).toLowerCase();
    const propertyType = clean(row.property_type).toLowerCase();
    const periodDuration = clean(row.period_duration);
    const isSeasonallyAdjusted = clean(row.is_seasonally_adjusted).toLowerCase();

    if (stateCode !== "OK") continue;
    oklahomaRows++;

    if (!TARGET_CITIES.includes(cityName)) continue;
    targetCityRows++;

    if (regionType !== "place") continue;
    if (propertyType !== "all residential") continue;
    if (periodDuration !== "30") continue;
    if (isSeasonallyAdjusted !== "false") continue;

    const medianDaysOnMarket = toNumber(row.median_dom);
    if (medianDaysOnMarket === null) continue;

    const medianDomYoy = toNumber(row.median_dom_yoy);
    const medianSalePrice = toNumber(row.median_sale_price);
    const homesSold = toNumber(row.homes_sold);
    const periodEnd = clean(row.period_end);
    const periodBegin = clean(row.period_begin);
    const lastUpdated = clean(row.last_updated);

    let previousYearDaysOnMarket = null;

    if (medianDomYoy !== null) {
      previousYearDaysOnMarket = Math.round(medianDaysOnMarket - medianDomYoy);
    }

    usableRows++;

    matchedRows.push({
      cityName,
      state: "OK",
      marketName: `${cityName}, OK`,
      periodBegin,
      periodEnd,
      lastUpdated,
      medianDaysOnMarket: Math.round(medianDaysOnMarket),
      previousYearDaysOnMarket,
      medianSalePrice,
      homesSold,
      speed: getSpeed(medianDaysOnMarket),
      sourceName: "Redfin Data Center",
      sourceUrl: "https://www.redfin.com/news/data-center/downloads/"
    });
  }

  console.log(`Redfin rows scanned: ${scannedRows}`);
  console.log(`Oklahoma rows found: ${oklahomaRows}`);
  console.log(`Target city rows found: ${targetCityRows}`);
  console.log(`Usable Redfin city rows: ${usableRows}`);

  const latestRows = pickLatestRowsByCity(matchedRows);

  if (!latestRows.length) {
    throw new Error("No usable Oklahoma city-level Redfin rows found.");
  }

  console.log(`Found ${latestRows.length} Oklahoma city-level Redfin markets.`);

  return latestRows.map((row) => ({
    marketName: row.marketName,
    state: row.state,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    latestDate: row.periodEnd || row.periodBegin,
    lastUpdated: row.lastUpdated,
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
