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

function toNumber(value) {
  const cleaned = clean(value).replace(/[$,%]/g, "");
  if (!cleaned || cleaned.toUpperCase() === "NA") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  return clean(value).toLowerCase();
}

function normalizeCityName(value) {
  return clean(value)
    .replace(/, Oklahoma$/i, "")
    .replace(/, OK$/i, "")
    .replace(/\s+city$/i, function (match, offset, full) {
      return /oklahoma city/i.test(full) ? match : "";
    })
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

function rowLooksLikeOklahoma(row) {
  const combined = Object.values(row).map(clean).join(" | ").toLowerCase();

  return (
    combined.includes(", ok") ||
    combined.includes("oklahoma") ||
    combined.includes("oklahoma city")
  );
}

function getPossibleRegionName(row) {
  return clean(
    getHeaderValue(row, [
      "region_name",
      "regionName",
      "region",
      "city",
      "place",
      "name"
    ])
  );
}

function getPossibleState(row) {
  return clean(
    getHeaderValue(row, [
      "state_code",
      "stateCode",
      "state",
      "state_name",
      "stateName"
    ])
  );
}

function cityMatchesTarget(regionName, targetCity) {
  const region = normalizeText(regionName);
  const city = normalizeText(targetCity);

  return (
    region === city ||
    region === city + ", ok" ||
    region === city + ", oklahoma" ||
    region.startsWith(city + ",") ||
    region.includes(city + ", ok") ||
    region.includes(city + ", oklahoma")
  );
}

function getTargetCityFromRow(row) {
  const regionName = getPossibleRegionName(row);

  for (const city of TARGET_CITIES) {
    if (cityMatchesTarget(regionName, city)) {
      return city;
    }
  }

  return "";
}

function getPeriodEnd(row) {
  return clean(
    getHeaderValue(row, [
      "period_end",
      "periodEnd",
      "period_end_date",
      "end_date"
    ])
  );
}

function getPeriodBegin(row) {
  return clean(
    getHeaderValue(row, [
      "period_begin",
      "periodBegin",
      "period_begin_date",
      "start_date"
    ])
  );
}

function getMedianDom(row) {
  return toNumber(
    getHeaderValue(row, [
      "median_dom",
      "median_days_on_market",
      "medianDaysOnMarket",
      "median_days_on_market_all",
      "days_on_market"
    ])
  );
}

function getMedianDomYoy(row) {
  return toNumber(
    getHeaderValue(row, [
      "median_dom_yoy",
      "median_days_on_market_yoy",
      "medianDaysOnMarketYoy"
    ])
  );
}

function getMedianSalePrice(row) {
  return toNumber(
    getHeaderValue(row, [
      "median_sale_price",
      "medianSalePrice",
      "median_sale_price_all"
    ])
  );
}

function getHomesSold(row) {
  return toNumber(
    getHeaderValue(row, [
      "homes_sold",
      "homesSold",
      "homes_sold_all"
    ])
  );
}

function pickBestRowsByCity(rows) {
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
  let cityNameMatches = 0;
  let oklahomaMatches = 0;

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

    const targetCity = getTargetCityFromRow(row);
    if (!targetCity) continue;

    cityNameMatches++;

    const possibleState = getPossibleState(row);
    const looksOklahoma =
      possibleState === "OK" ||
      /oklahoma/i.test(possibleState) ||
      rowLooksLikeOklahoma(row);

    if (!looksOklahoma) continue;

    oklahomaMatches++;

    const propertyType = normalizeText(
      getHeaderValue(row, ["property_type", "propertyType"])
    );

    const periodDuration = clean(
      getHeaderValue(row, ["period_duration", "periodDuration"])
    );

    const isSeasonallyAdjusted = normalizeText(
      getHeaderValue(row, ["is_seasonally_adjusted", "isSeasonallyAdjusted"])
    );

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

    matchedRows.push({
      cityName: targetCity,
      state: "OK",
      marketName: `${targetCity}, OK`,
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
  console.log(`Target city name matches: ${cityNameMatches}`);
  console.log(`Oklahoma target matches: ${oklahomaMatches}`);
  console.log(`Usable Redfin city rows: ${matchedRows.length}`);

  const latestRows = pickBestRowsByCity(matchedRows);

  if (!latestRows.length) {
    throw new Error(
      "No usable Oklahoma city-level rows found in Redfin data after flexible matching."
    );
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
