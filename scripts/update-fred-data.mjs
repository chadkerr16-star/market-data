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

function clean(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function normalizeHeader(value) {
  return clean(value)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function toNumber(value) {
  const cleaned = clean(value).replace(/[$,%]/g, "");
  if (!cleaned || cleaned.toUpperCase() === "NA") return null;

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function getSpeed(days) {
  const n = Number(days);
  if (n <= 49) return "Fast";
  if (n >= 50 && n <= 60) return "Normal";
  return "Slower";
}

function parseTsvLine(line) {
  return line.split("\t");
}

function buildRow(headers, values) {
  const row = {};

  headers.forEach((header, index) => {
    row[normalizeHeader(header)] = values[index] ?? "";
  });

  return row;
}

function getValue(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return "";
}

function rowToText(row) {
  return Object.values(row).map(clean).join(" | ");
}

function rowLooksOklahoma(row) {
  const stateCode = normalize(getValue(row, ["state_code", "statecode"]));
  const state = normalize(getValue(row, ["state", "state_name", "statename"]));
  const fullText = normalize(rowToText(row));

  return (
    stateCode === "ok" ||
    state === "ok" ||
    state === "oklahoma" ||
    fullText.includes(", ok") ||
    fullText.includes("oklahoma")
  );
}

function findTargetCity(row) {
  const fullText = normalize(rowToText(row));

  for (const city of TARGET_CITIES) {
    const cityText = normalize(city);

    if (
      fullText.includes(cityText + ", ok") ||
      fullText.includes(cityText + ", oklahoma") ||
      fullText.includes("| " + cityText + " |") ||
      fullText.includes("| " + cityText + ",") ||
      fullText.includes(cityText)
    ) {
      return city;
    }
  }

  return "";
}

function getPeriodEnd(row) {
  return clean(getValue(row, ["period_end", "periodend", "end_date"]));
}

function getPeriodBegin(row) {
  return clean(getValue(row, ["period_begin", "periodbegin", "start_date"]));
}

function getPropertyType(row) {
  return normalize(getValue(row, ["property_type", "propertytype"]));
}

function getPeriodDuration(row) {
  return clean(getValue(row, ["period_duration", "periodduration"]));
}

function getSeasonallyAdjusted(row) {
  return normalize(getValue(row, ["is_seasonally_adjusted", "isseasonallyadjusted"]));
}

function getMedianDom(row) {
  return toNumber(
    getValue(row, [
      "median_dom",
      "median_days_on_market",
      "mediandom",
      "mediandaysonmarket",
      "days_on_market"
    ])
  );
}

function getMedianDomYoy(row) {
  return toNumber(
    getValue(row, [
      "median_dom_yoy",
      "median_days_on_market_yoy",
      "mediandomyoy",
      "mediandaysonmarketyoy"
    ])
  );
}

function getMedianSalePrice(row) {
  return toNumber(
    getValue(row, [
      "median_sale_price",
      "mediansaleprice",
      "median_price"
    ])
  );
}

function getHomesSold(row) {
  return toNumber(
    getValue(row, [
      "homes_sold",
      "homessold",
      "sold_count"
    ])
  );
}

function pickLatestRowsByCity(rows) {
  const latestByCity = new Map();

  for (const row of rows) {
    const existing = latestByCity.get(row.cityName);

    if (!existing) {
      latestByCity.set(row.cityName, row);
      continue;
    }

    if ((row.periodEnd || "") > (existing.periodEnd || "")) {
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
  let cityMatches = 0;
  let usableRows = 0;
  let printedSamples = 0;

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

    if (!rowLooksOklahoma(row)) continue;
    oklahomaRows++;

    const cityName = findTargetCity(row);
    if (!cityName) {
      if (printedSamples < 3) {
        console.log("Sample Oklahoma row not matched to target city:");
        console.log(rowToText(row).slice(0, 500));
        printedSamples++;
      }
      continue;
    }

    cityMatches++;

    const propertyType = getPropertyType(row);
    const periodDuration = getPeriodDuration(row);
    const isSeasonallyAdjusted = getSeasonallyAdjusted(row);

    if (propertyType && propertyType !== "all residential") continue;
    if (periodDuration && periodDuration !== "30") continue;
    if (isSeasonallyAdjusted === "true") continue;

    const medianDaysOnMarket = getMedianDom(row);
    if (medianDaysOnMarket === null) continue;

    const medianDomYoy = getMedianDomYoy(row);
    const medianSalePrice = getMedianSalePrice(row);
    const homesSold = getHomesSold(row);
    const periodEnd = getPeriodEnd(row);
    const periodBegin = getPeriodBegin(row);

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
  console.log(`Target city matches: ${cityMatches}`);
  console.log(`Usable Redfin city rows: ${usableRows}`);

  const latestRows = pickLatestRowsByCity(matchedRows);

  if (!latestRows.length) {
    throw new Error("No usable Oklahoma city-level rows found in Redfin data.");
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
