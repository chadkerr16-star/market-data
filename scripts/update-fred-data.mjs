import fs from "fs/promises";
import { Readable } from "stream";
import zlib from "zlib";
import readline from "readline";

const CONFIG_PATH = "data/market-config.json";
const OUTPUT_PATH = "data/market-data.json";

const REDFIN_CITY_DATA_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/city_market_tracker.tsv000.gz";

const ZILLOW_ZHVI_CITY_URLS = [
  "https://files.zillowstatic.com/research/public_csvs/zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  "https://files.zillowstatic.com/research/public_csvs/zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_month.csv"
];

const BRAND_DEFAULTS = {
  name: "Your Home Sold Guaranteed Realty – Kerr Team",
  phone: "330-3000",
  textKeyword: "VALUE",
  website: "kerrteam.com",
  shortName: "Kerr Team"
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

function normalizeText(value) {
  return stripQuotes(value).toLowerCase().trim();
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

function getSpeed(days) {
  const n = Number(days);
  if (n <= 49) return "Fast";
  if (n >= 50 && n <= 60) return "Normal";
  return "Slower";
}

function formatMonthLabel(dateText) {
  if (!dateText) return "";

  const parts = String(dateText).split("-");
  if (parts.length !== 3) return dateText;

  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function parseTsvLine(line) {
  return line.split("\t").map(stripQuotes);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map(stripQuotes);
}

function buildRow(headers, values) {
  const row = {};

  headers.forEach((header, index) => {
    row[normalizeHeader(header)] = values[index] ?? "";
  });

  return row;
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
  const previousMonth = rows.length >= 2 ? rows[rows.length - 2] : null;
  const previousYear = rows.length >= 13 ? rows[rows.length - 13] : null;

  return {
    latestDate: latest.date,
    medianDaysOnMarket: Math.round(Number(latest.value)),
    previousMonthDate: previousMonth ? previousMonth.date : null,
    previousMonthDaysOnMarket: previousMonth ? Math.round(Number(previousMonth.value)) : null,
    previousYearDate: previousYear ? previousYear.date : null,
    previousYearDaysOnMarket: previousYear ? Math.round(Number(previousYear.value)) : null
  };
}

async function fetchFredSeries(seriesId) {
  const fredUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(
    seriesId
  )}`;

  const response = await fetch(fredUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch ${seriesId}: ${response.status}`);
  }

  const csvText = await response.text();
  return parseFredCsv(csvText, seriesId);
}

async function fetchFredMetroSignals(config) {
  console.log("Fetching Realtor.com / FRED metro supporting signals...");

  const signals = [];

  if (!config.markets || !Array.isArray(config.markets)) {
    console.log("No FRED config markets found.");
    return signals;
  }

  for (const market of config.markets) {
    if (!market.seriesId) continue;

    try {
      console.log(`Fetching FRED signal: ${market.marketName} - ${market.seriesId}`);

      const parsed = await fetchFredSeries(market.seriesId);

      signals.push({
        marketName: market.marketName,
        state: market.state || "OK",
        cities: market.cities || [],
        sourceName: market.sourceName || "FRED / Realtor.com Housing Inventory",
        sourceUrl: market.sourceUrl || "https://fred.stlouisfed.org/",
        seriesId: market.seriesId,
        geography: market.marketName,
        latestDate: parsed.latestDate,
        latestMonthLabel: formatMonthLabel(parsed.latestDate),
        medianDom: parsed.medianDaysOnMarket,
        previousMonthDaysOnMarket: parsed.previousMonthDaysOnMarket,
        previousYearDaysOnMarket: parsed.previousYearDaysOnMarket
      });
    } catch (error) {
      console.warn(`Skipping FRED signal for ${market.marketName}: ${error.message}`);
    }
  }

  console.log(`FRED metro signals found: ${signals.length}`);
  return signals;
}

function findFredSignalForCity(cityName, fredSignals) {
  const normalizedCity = normalizeText(cityName);

  return fredSignals.find((signal) => {
    return (signal.cities || []).some((city) => normalizeText(city) === normalizedCity);
  });
}

function findLatestZillowValue(row, headers) {
  const dateColumns = headers
    .map((header) => clean(header))
    .filter((header) => /^\d{4}-\d{2}-\d{2}$/.test(header))
    .sort();

  for (let i = dateColumns.length - 1; i >= 0; i--) {
    const dateColumn = dateColumns[i];
    const value = toNumber(row[normalizeHeader(dateColumn)]);

    if (value !== null) {
      return {
        date: dateColumn,
        value: Math.round(value)
      };
    }
  }

  return null;
}

async function fetchZillowCitySignals() {
  console.log("Fetching Zillow Research city ZHVI supporting signals...");

  for (const url of ZILLOW_ZHVI_CITY_URLS) {
    try {
      const cacheBustedUrl = `${url}?t=${Date.now()}`;
      console.log(`Trying Zillow URL: ${url}`);

      const response = await fetch(cacheBustedUrl);

      if (!response.ok) {
        throw new Error(`Zillow returned ${response.status}`);
      }

      const csvText = await response.text();
      const lines = csvText.trim().split(/\r?\n/);

      if (lines.length < 2) {
        throw new Error("Zillow CSV did not contain rows.");
      }

      const headers = parseCsvLine(lines[0]);
      const signals = [];

      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;

        const values = parseCsvLine(line);
        const row = buildRow(headers, values);

        const cityName = clean(row.regionname);
        const stateName = clean(row.statename || row.state);
        const regionType = clean(row.regiontype);

        if (!TARGET_CITIES.includes(cityName)) continue;

        const isOklahoma =
          normalizeText(stateName) === "ok" ||
          normalizeText(stateName) === "oklahoma";

        if (!isOklahoma) continue;

        if (regionType && normalizeText(regionType) !== "city") continue;

        const latest = findLatestZillowValue(row, headers);

        if (!latest) continue;

        signals.push({
          cityName,
          state: "OK",
          sourceName: "Zillow Research",
          sourceUrl: "https://www.zillow.com/research/data/",
          label: "Zillow Typical Home Value",
          geography: `${cityName}, OK`,
          regionType: regionType || "City",
          latestDate: latest.date,
          latestMonthLabel: formatMonthLabel(latest.date),
          typicalHomeValue: latest.value,
          note:
            "Zillow ZHVI is a typical home value estimate for the middle of the market. It is not the same as median sale price."
        });
      }

      console.log(`Zillow city signals found: ${signals.length}`);
      return signals;
    } catch (error) {
      console.warn(`Zillow URL failed: ${error.message}`);
    }
  }

  console.warn("No Zillow city signals were added.");
  return [];
}

function findZillowSignalForCity(cityName, zillowSignals) {
  const normalizedCity = normalizeText(cityName);

  return zillowSignals.find((signal) => normalizeText(signal.cityName) === normalizedCity);
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
    latestMonthLabel: formatMonthLabel(row.periodEnd || row.periodBegin),
    lastUpdated: row.lastUpdated,
    medianDaysOnMarket: row.medianDaysOnMarket,
    previousYearDaysOnMarket: row.previousYearDaysOnMarket,
    medianSalePrice: row.medianSalePrice,
    homesSold: row.homesSold,
    speed: row.speed,
    cities: [row.cityName]
  }));
}

async function fetchFredFallbackMarkets(config) {
  console.log("Using FRED/Realtor.com metro fallback data...");

  const markets = [];

  if (!config.markets || !Array.isArray(config.markets)) {
    throw new Error("No fallback FRED markets found in data/market-config.json.");
  }

  for (const market of config.markets) {
    if (!market.seriesId) continue;

    console.log(`Fetching fallback market: ${market.marketName} - ${market.seriesId}`);

    const parsed = await fetchFredSeries(market.seriesId);

    markets.push({
      marketName: market.marketName,
      state: market.state || "OK",
      seriesId: market.seriesId,
      sourceName: market.sourceName || "FRED / Realtor.com Housing Inventory",
      sourceUrl: market.sourceUrl || "https://fred.stlouisfed.org/",
      cities: market.cities || [],
      latestDate: parsed.latestDate,
      latestMonthLabel: formatMonthLabel(parsed.latestDate),
      medianDaysOnMarket: parsed.medianDaysOnMarket,
      previousYearDaysOnMarket: parsed.previousYearDaysOnMarket,
      previousMonthDaysOnMarket: parsed.previousMonthDaysOnMarket,
      speed: getSpeed(parsed.medianDaysOnMarket)
    });
  }

  return markets;
}

function addAdditionalSignals(markets, fredSignals, zillowSignals) {
  return markets.map((market) => {
    const cityName = market.cities && market.cities[0] ? market.cities[0] : market.marketName;
    const fredSignal = findFredSignalForCity(cityName, fredSignals);
    const zillowSignal = findZillowSignalForCity(cityName, zillowSignals);

    const additionalSignals = {};

    if (fredSignal) {
      additionalSignals.realtor = {
        label: "Listing Market Pace",
        sourceName: fredSignal.sourceName,
        sourceUrl: fredSignal.sourceUrl,
        geography: fredSignal.geography,
        seriesId: fredSignal.seriesId,
        latestDate: fredSignal.latestDate,
        latestMonthLabel: fredSignal.latestMonthLabel,
        medianDom: fredSignal.medianDom,
        previousMonthDaysOnMarket: fredSignal.previousMonthDaysOnMarket,
        previousYearDaysOnMarket: fredSignal.previousYearDaysOnMarket,
        note:
          "Metro-level Realtor.com/FRED listing pace signal. This may differ from Redfin city-level sold-market days on market."
      };
    }

    if (zillowSignal) {
      additionalSignals.zillow = {
        label: zillowSignal.label,
        sourceName: zillowSignal.sourceName,
        sourceUrl: zillowSignal.sourceUrl,
        geography: zillowSignal.geography,
        regionType: zillowSignal.regionType,
        latestDate: zillowSignal.latestDate,
        latestMonthLabel: zillowSignal.latestMonthLabel,
        typicalHomeValue: zillowSignal.typicalHomeValue,
        note: zillowSignal.note
      };
    }

    return {
      ...market,
      additionalSignals
    };
  });
}

async function main() {
  const configText = await fs.readFile(CONFIG_PATH, "utf8");
  const config = JSON.parse(configText);

  let markets = [];
  let dataMode = "redfin-city-level-with-fred-and-zillow-signals";

  const fredSignals = await fetchFredMetroSignals(config);
  const zillowSignals = await fetchZillowCitySignals();

  try {
    markets = await fetchRedfinCityData();
    markets = addAdditionalSignals(markets, fredSignals, zillowSignals);
  } catch (error) {
    console.warn("Redfin city-level data was not available.");
    console.warn(error.message);

    dataMode = "fred-metro-fallback";
    markets = await fetchFredFallbackMarkets(config);
    markets = addAdditionalSignals(markets, fredSignals, zillowSignals);
  }

  const output = {
    brand: {
      ...BRAND_DEFAULTS,
      ...(config.brand || {})
    },
    dataMode,
    updatedAt: new Date().toISOString(),
    note:
      "Primary market speed uses Redfin city-level median days on market when available. Additional market signals may use Realtor.com/FRED metro-level data and Zillow Research city-level ZHVI. These sources measure different things and may not match exactly.",
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
