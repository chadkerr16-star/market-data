import fs from "fs/promises";

const CONFIG_PATH = "data/market-config.json";
const OUTPUT_PATH = "data/market-data.json";

const BRAND_DEFAULTS = {
  name: "Your Home Sold Guaranteed Realty – Kerr Team",
  phone: "330-3000",
  textKeyword: "VALUE",
  website: "kerrteam.com",
  shortName: "Kerr Team"
};

const FEATURED_CITIES = [
  "Edmond",
  "Moore",
  "Mustang",
  "Norman",
  "Oklahoma City",
  "Yukon"
];

const MLSOK_REPORTS = [
  {
    metric: "medianDaysOnMarket",
    name: "MLSOK DOM Batch 1",
    url: "https://mlsok.stats.showingtime.com/infoserv/s-v1/N6QC-ffg.csv"
  },
  {
    metric: "medianDaysOnMarket",
    name: "MLSOK DOM Batch 2",
    url: "https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Q2-uWp.csv"
  },
  {
    metric: "medianSalePrice",
    name: "MLSOK Median Sales Price Batch 1",
    url: "https://mlsok.stats.showingtime.com/infoserv/s-v1/N6P3-fNj.csv"
  },
  {
    metric: "medianSalePrice",
    name: "MLSOK Median Sales Price Batch 2",
    url: "https://mlsok.stats.showingtime.com/infoserv/s-v1/N6PM-lTC.csv"
  },
  {
    metric: "homesSold",
    name: "MLSOK Closed Sales Batch 1",
    url: "https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Yu-u0O.csv"
  },
  {
    metric: "homesSold",
    name: "MLSOK Closed Sales Batch 2",
    url: "https://mlsok.stats.showingtime.com/infoserv/s-v1/N6YX-s3M.csv"
  }
];

function clean(value) {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(clean(current));
      current = "";
      continue;
    }

    current += char;
  }

  values.push(clean(current));
  return values;
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

function monthNameToNumber(monthName) {
  const months = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
  };

  return months[String(monthName || "").toLowerCase()] || "01";
}

function parseMonthYear(dateText) {
  const parts = clean(dateText).split(/\s+/);

  if (parts.length < 2) {
    return {
      label: clean(dateText),
      isoDate: "",
      month: "",
      year: ""
    };
  }

  const monthName = parts[0];
  const year = parts[1];
  const month = monthNameToNumber(monthName);

  return {
    label: `${monthName} ${year}`,
    isoDate: `${year}-${month}-01`,
    month,
    year
  };
}

function findDateHeaderIndex(lines) {
  return lines.findIndex((line) => {
    const firstCell = parseCsvLine(line)[0];
    return clean(firstCell).toLowerCase() === "date";
  });
}

async function fetchCsv(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function readShowingTimeReport(report) {
  console.log(`Fetching ${report.name}: ${report.url}`);

  const csvText = await fetchCsv(report.url);

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dataFromLine = lines.find((line) =>
    line.toLowerCase().startsWith("data from:")
  );

  const dataFrom = dataFromLine ? parseCsvLine(dataFromLine)[1] : "";

  const headerIndex = findDateHeaderIndex(lines);

  if (headerIndex === -1) {
    throw new Error(`Could not find Date header in ${report.name}`);
  }

  const headers = parseCsvLine(lines[headerIndex]).filter(Boolean);
  const cities = headers.slice(1);

  console.log(`Cities found in ${report.name}: ${cities.join(", ")}`);

  const dataLines = lines.slice(headerIndex + 1);

  const parsedRows = dataLines
    .map((line) => parseCsvLine(line))
    .filter((row) => row.length >= 2 && clean(row[0]));

  if (!parsedRows.length) {
    throw new Error(`No monthly data rows found in ${report.name}`);
  }

  const latestRow = parsedRows[parsedRows.length - 1];
  const latestDate = parseMonthYear(latestRow[0]);

  const previousYearRow = parsedRows.find((row) => {
    const parsedDate = parseMonthYear(row[0]);
    return (
      parsedDate.month === latestDate.month &&
      String(Number(parsedDate.year) + 1) === latestDate.year
    );
  });

  const values = [];

  cities.forEach((city, index) => {
    if (!FEATURED_CITIES.includes(city)) return;

    const currentValue = toNumber(latestRow[index + 1]);
    const previousYearValue = previousYearRow
      ? toNumber(previousYearRow[index + 1])
      : null;

    if (currentValue === null) return;

    values.push({
      city,
      metric: report.metric,
      currentValue,
      previousYearValue,
      latestDate,
      dataFrom,
      sourceUrl: report.url.replace(/\.csv$/i, "")
    });
  });

  return values;
}

async function fetchMlsokData() {
  console.log("Fetching MLSOK / ShowingTime market data...");

  const cityRows = new Map();

  FEATURED_CITIES.forEach((city) => {
    cityRows.set(city, {
      marketName: `${city}, OK`,
      state: "OK",
      sourceName: "MLSOK / ShowingTime",
      sourceUrl: "",
      latestDate: "",
      latestDateLabel: "",
      dataFrom: "",
      medianDaysOnMarket: null,
      previousYearDaysOnMarket: null,
      medianSalePrice: null,
      previousYearMedianSalePrice: null,
      homesSold: null,
      previousYearHomesSold: null,
      speed: "Normal",
      cities: [city]
    });
  });

  for (const report of MLSOK_REPORTS) {
    const values = await readShowingTimeReport(report);

    values.forEach((item) => {
      const row = cityRows.get(item.city);
      if (!row) return;

      row.sourceUrl = item.sourceUrl;
      row.latestDate = item.latestDate.isoDate;
      row.latestDateLabel = item.latestDate.label;
      row.dataFrom = item.dataFrom;

      if (item.metric === "medianDaysOnMarket") {
        row.medianDaysOnMarket = Math.round(item.currentValue);
        row.previousYearDaysOnMarket =
          item.previousYearValue !== null ? Math.round(item.previousYearValue) : null;
        row.speed = getSpeed(item.currentValue);
      }

      if (item.metric === "medianSalePrice") {
        row.medianSalePrice = Math.round(item.currentValue);
        row.previousYearMedianSalePrice =
          item.previousYearValue !== null ? Math.round(item.previousYearValue) : null;
      }

      if (item.metric === "homesSold") {
        row.homesSold = Math.round(item.currentValue);
        row.previousYearHomesSold =
          item.previousYearValue !== null ? Math.round(item.previousYearValue) : null;
      }
    });
  }

  const markets = Array.from(cityRows.values())
    .filter((row) => row.medianDaysOnMarket !== null)
    .sort((a, b) => a.marketName.localeCompare(b.marketName));

  if (!markets.length) {
    throw new Error("No MLSOK market data was found.");
  }

  console.log(`MLSOK markets found: ${markets.length}`);

  return markets;
}

async function main() {
  let config = {};

  try {
    const configText = await fs.readFile(CONFIG_PATH, "utf8");
    config = JSON.parse(configText);
  } catch {
    console.warn("No market-config.json found. Using default brand settings.");
  }

  const markets = await fetchMlsokData();

  const output = {
    brand: {
      ...BRAND_DEFAULTS,
      ...(config.brand || {})
    },
    dataMode: "mlsok-showingtime-city-dom-price-sales",
    updatedAt: new Date().toISOString(),
    markets
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("Data mode: mlsok-showingtime-city-dom-price-sales");
  console.log(`Markets written: ${markets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
