import fs from 'node:fs/promises';
import path from 'node:path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'market-config.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'market-data.json');

const DEFAULT_BRAND = {
  name: 'Your Home Sold Guaranteed Realty – Kerr Team',
  shortName: 'Kerr Team',
  phone: '330-3000',
  textKeyword: 'VALUE',
  website: 'kerrteam.com'
};

const FEATURED_CITIES = ['Edmond', 'Moore', 'Mustang', 'Norman', 'Oklahoma City', 'Yukon'];

const PRICE_RANGES = [
  { key: '200-299', label: '$200k–$299k' },
  { key: '300-399', label: '$300k–$399k' },
  { key: '400-499', label: '$400k–$499k' },
  { key: '500-plus', label: '$500k+' }
];

const REPORTS = [
  // Citywide core metrics
  { type: 'citywide', metric: 'dom', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6QC-ffg.csv' },
  { type: 'citywide', metric: 'dom', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Q2-uWp.csv' },
  { type: 'citywide', metric: 'medianSalePrice', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6P3-fNj.csv' },
  { type: 'citywide', metric: 'medianSalePrice', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6PM-lTC.csv' },
  { type: 'citywide', metric: 'homesSold', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Yu-u0O.csv' },
  { type: 'citywide', metric: 'homesSold', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6YX-s3M.csv' },

  // Price-range Median Days on Market
  { type: 'priceRange', metric: 'dom', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Fd-8LO.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoY1-sg9.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHQ-Cnz.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHm-2yd.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHZ-lEa.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHj-fVZ.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHY-WbN.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHH-V61.csv' },

  // Price-range Homes for Sale
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHO-b30.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHy-rv1.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHD-yqn.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHK-i4q.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoH1-NkQ.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHi-00l.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHU-4IT.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHW-vIu.csv' },

  // Price-range Pending Sales
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHI-zcw.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHe-iyf.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoH0-SJ7.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHG-p9H.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFt-thy.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFd-rnh.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFQ-t4Q.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFb-LaJ.csv' },

  // Price-range Closed Sales
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFH-tos.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFO-8Es.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFy-Vgn.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFD-IZw.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFJ-Gb0.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFW-ybY.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFk-MYX.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoF9-sLr.csv' },

  // Price-range Months Supply
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoE3-773.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEl-8Nd.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEf-mI1.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEH-Ga9.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEw-DDo.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEu-ghu.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEs-1vu.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEz-49t.csv' }
];

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[$,%]/g, '').trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function monthToDate(label) {
  const months = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12'
  };

  const match = String(label || '').trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const month = months[match[1].toLowerCase()];
  if (!month) return null;

  return {
    label: `${match[1]} ${match[2]}`,
    monthName: match[1],
    year: Number(match[2]),
    isoDate: `${match[2]}-${month}-01`
  };
}

function getSpeed(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return 'Unknown';
  if (n <= 49) return 'Fast';
  if (n >= 50 && n <= 60) return 'Normal';
  return 'Slower';
}

function roundMetric(metric, value) {
  if (value === null || value === undefined) return null;

  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  if (metric === 'monthsSupply') return Math.round(number * 10) / 10;
  return Math.round(number);
}

function priceRangeLabel(key) {
  const found = PRICE_RANGES.find(item => item.key === key);
  return found ? found.label : key;
}

function priceRangeOrder(key) {
  const index = PRICE_RANGES.findIndex(item => item.key === key);
  return index === -1 ? 999 : index;
}

function getCityRecord(records, city) {
  if (!records.has(city)) {
    records.set(city, {
      marketName: `${city} Housing Market`,
      state: 'OK',
      city,
      sourceName: 'MLSOK / ShowingTime',
      sourceUrl: '',
      latestDate: null,
      latestDateLabel: null,
      dataFrom: null,
      medianDaysOnMarket: null,
      previousYearDaysOnMarket: null,
      medianSalePrice: null,
      previousYearMedianSalePrice: null,
      homesSold: null,
      previousYearHomesSold: null,
      speed: 'Unknown',
      priceRanges: []
    });
  }

  return records.get(city);
}

function getPriceRangeRecord(cityRecord, key) {
  let range = cityRecord.priceRanges.find(item => item.key === key);

  if (!range) {
    range = {
      key,
      label: priceRangeLabel(key),
      medianDaysOnMarket: null,
      previousYearDaysOnMarket: null,
      speed: 'Unknown',
      homesForSale: null,
      previousYearHomesForSale: null,
      pendingSales: null,
      previousYearPendingSales: null,
      closedSales: null,
      previousYearClosedSales: null,
      monthsSupply: null,
      previousYearMonthsSupply: null,
      latestDate: null,
      latestDateLabel: null
    };

    cityRecord.priceRanges.push(range);
  }

  return range;
}

function parseShowingTimeCsv(csv) {
  const lines = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const metricLine = lines.find(line => line.toLowerCase().startsWith('metric:'));
  const dataFromLine = lines.find(line => line.toLowerCase().startsWith('data from:'));
  const headerIndex = lines.findIndex(line => line.toLowerCase().startsWith('date,'));

  if (headerIndex === -1) {
    throw new Error('Could not find Date header row.');
  }

  const headers = parseCsvLine(lines[headerIndex]).filter(Boolean);
  const cities = headers.slice(1);
  const rows = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line || line.startsWith('"All data from')) break;

    const values = parseCsvLine(line);
    const date = monthToDate(values[0]);

    if (!date) continue;

    const row = { date, values: {} };

    cities.forEach((city, index) => {
      row.values[city] = parseNumber(values[index + 1]);
    });

    rows.push(row);
  }

  if (!rows.length) {
    throw new Error('No monthly data rows found.');
  }

  return {
    metricName: metricLine ? parseCsvLine(metricLine)[1] || '' : '',
    dataFrom: dataFromLine ? parseCsvLine(dataFromLine)[1] || '' : '',
    cities,
    rows
  };
}

function previousYearRow(rows, latestDate) {
  return rows.find(row =>
    row.date.year === latestDate.year - 1 &&
    row.date.monthName.toLowerCase() === latestDate.monthName.toLowerCase()
  ) || null;
}

async function fetchReport(report) {
  const response = await fetch(report.url, {
    headers: { 'user-agent': 'KerrTeamMarketDataBot/2.0' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${report.url}: ${response.status} ${response.statusText}`);
  }

  const csv = await response.text();
  return parseShowingTimeCsv(csv);
}

function applyCitywideMetric(records, report, parsed) {
  const latest = parsed.rows[parsed.rows.length - 1];
  const prior = previousYearRow(parsed.rows, latest.date);

  for (const city of parsed.cities) {
    const currentValue = roundMetric(report.metric, latest.values[city]);
    const previousYearValue = prior ? roundMetric(report.metric, prior.values[city]) : null;
    const cityRecord = getCityRecord(records, city);

    cityRecord.sourceUrl = report.url;
    cityRecord.latestDate = latest.date.isoDate;
    cityRecord.latestDateLabel = latest.date.label;
    cityRecord.dataFrom = parsed.dataFrom;

    if (report.metric === 'dom') {
      cityRecord.medianDaysOnMarket = currentValue;
      cityRecord.previousYearDaysOnMarket = previousYearValue;
      cityRecord.speed = getSpeed(currentValue);
    }

    if (report.metric === 'medianSalePrice') {
      cityRecord.medianSalePrice = currentValue;
      cityRecord.previousYearMedianSalePrice = previousYearValue;
    }

    if (report.metric === 'homesSold') {
      cityRecord.homesSold = currentValue;
      cityRecord.previousYearHomesSold = previousYearValue;
    }
  }
}

function applyPriceRangeMetric(records, report, parsed) {
  const latest = parsed.rows[parsed.rows.length - 1];
  const prior = previousYearRow(parsed.rows, latest.date);

  for (const city of parsed.cities) {
    const currentValue = roundMetric(report.metric, latest.values[city]);
    const previousYearValue = prior ? roundMetric(report.metric, prior.values[city]) : null;
    const cityRecord = getCityRecord(records, city);
    const range = getPriceRangeRecord(cityRecord, report.priceRangeKey);

    range.latestDate = latest.date.isoDate;
    range.latestDateLabel = latest.date.label;

    if (report.metric === 'dom') {
      range.medianDaysOnMarket = currentValue;
      range.previousYearDaysOnMarket = previousYearValue;
      range.speed = getSpeed(currentValue);
    }

    if (report.metric === 'homesForSale') {
      range.homesForSale = currentValue;
      range.previousYearHomesForSale = previousYearValue;
    }

    if (report.metric === 'pendingSales') {
      range.pendingSales = currentValue;
      range.previousYearPendingSales = previousYearValue;
    }

    if (report.metric === 'closedSales') {
      range.closedSales = currentValue;
      range.previousYearClosedSales = previousYearValue;
    }

    if (report.metric === 'monthsSupply') {
      range.monthsSupply = currentValue;
      range.previousYearMonthsSupply = previousYearValue;
    }
  }
}

async function readBrandConfig() {
  try {
    const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_BRAND, ...(config.brand || {}) };
  } catch {
    return DEFAULT_BRAND;
  }
}

function validateRecords(markets) {
  const warnings = [];

  for (const market of markets) {
    for (const priceRange of PRICE_RANGES) {
      const range = market.priceRanges.find(item => item.key === priceRange.key);

      if (!range) {
        warnings.push(`${market.city} missing range ${priceRange.key}`);
        continue;
      }

      ['medianDaysOnMarket', 'homesForSale', 'pendingSales', 'closedSales', 'monthsSupply'].forEach(field => {
        if (range[field] === null || range[field] === undefined) {
          warnings.push(`${market.city} ${range.label} missing ${field}`);
        }
      });
    }
  }

  return warnings;
}

async function main() {
  const brand = await readBrandConfig();
  const generatedAt = new Date().toISOString();
  const records = new Map();

  for (const report of REPORTS) {
    try {
      const parsed = await fetchReport(report);

      if (report.type === 'citywide') {
        applyCitywideMetric(records, report, parsed);
      } else {
        applyPriceRangeMetric(records, report, parsed);
      }

      console.log(`Loaded ${report.type} ${report.metric}${report.priceRangeKey ? ` ${report.priceRangeKey}` : ''}`);
    } catch (error) {
      console.error(`ERROR: ${report.url}`);
      console.error(error.message);
    }
  }

  const markets = Array.from(records.values())
    .filter(market => FEATURED_CITIES.includes(market.city))
    .sort((a, b) => a.city.localeCompare(b.city))
    .map(market => ({
      ...market,
      cities: [market.city],
      marketName: `${market.city} Housing Market`,
      priceRanges: market.priceRanges.sort((a, b) => priceRangeOrder(a.key) - priceRangeOrder(b.key))
    }));

  const warnings = validateRecords(markets);

  if (warnings.length) {
    console.warn('\nData warnings:');
    warnings.forEach(warning => console.warn(`- ${warning}`));
  }

  const output = {
    generatedAt,
    dataMode: 'mlsok-showingtime-city-price-range-full-market-read',
    brand,
    metric: 'Median Days on Market, Homes for Sale, Pending Sales, Closed Sales, Months Supply',
    note: 'MLSOK / ShowingTime monthly city-level data. Price-range DOM reflects recently sold market time; Homes for Sale reflects current competition; Pending Sales, Closed Sales, and Months Supply help describe demand and inventory pressure.',
    featuredCities: FEATURED_CITIES,
    priceRanges: PRICE_RANGES,
    markets
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\nWrote ${OUTPUT_PATH} with ${markets.length} markets.`);
  console.log(`Data mode: ${output.dataMode}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
