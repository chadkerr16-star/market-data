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

const FULL_MLSOK_CITIES = ['Edmond', 'Moore', 'Mustang', 'Norman', 'Oklahoma City', 'Yukon'];

const BASIC_PUBLIC_MARKETS = [
  {
    marketName: 'Oklahoma City Metro',
    state: 'OK',
    seriesId: 'MEDDAYONMAR36420',
    sourceName: 'FRED / Realtor.com Housing Inventory',
    sourceUrl: 'https://fred.stlouisfed.org/series/MEDDAYONMAR36420',
    cities: ['Oklahoma City', 'Norman', 'Edmond', 'Moore', 'Noble', 'Tuttle', 'Yukon', 'Mustang', 'Newcastle', 'Piedmont', 'Choctaw', 'Midwest City', 'Del City', 'Bethany', 'The Village', 'Nichols Hills', 'Blanchard', 'Harrah', 'Jones']
  },
  {
    marketName: 'Tulsa Metro',
    state: 'OK',
    seriesId: 'MEDDAYONMAR46140',
    sourceName: 'FRED / Realtor.com Housing Inventory',
    sourceUrl: 'https://fred.stlouisfed.org/series/MEDDAYONMAR46140',
    cities: ['Tulsa', 'Broken Arrow', 'Bixby', 'Jenks', 'Owasso', 'Sand Springs', 'Sapulpa', 'Claremore', 'Glenpool', 'Collinsville']
  },
  {
    marketName: 'Lawton Metro',
    state: 'OK',
    seriesId: 'MEDDAYONMAR30020',
    sourceName: 'FRED / Realtor.com Housing Inventory',
    sourceUrl: 'https://fred.stlouisfed.org/series/MEDDAYONMAR30020',
    cities: ['Lawton', 'Cache', 'Elgin', 'Fletcher', 'Medicine Park', 'Geronimo']
  },
  {
    marketName: 'Enid Metro',
    state: 'OK',
    seriesId: 'MEDDAYONMAR21420',
    sourceName: 'FRED / Realtor.com Housing Inventory',
    sourceUrl: 'https://fred.stlouisfed.org/series/MEDDAYONMAR21420',
    cities: ['Enid', 'North Enid', 'Waukomis', 'Garber', 'Hennessey']
  }
];

const PRICE_RANGES = [
  { key: '200-299', label: '$200k–$299k' },
  { key: '300-399', label: '$300k–$399k' },
  { key: '400-499', label: '$400k–$499k' },
  { key: '500-plus', label: '$500k+' }
];

const MLSOK_REPORTS = [
  { type: 'citywide', metric: 'dom', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6QC-ffg.csv' },
  { type: 'citywide', metric: 'dom', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Q2-uWp.csv' },
  { type: 'citywide', metric: 'medianSalePrice', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6P3-fNj.csv' },
  { type: 'citywide', metric: 'medianSalePrice', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6PM-lTC.csv' },
  { type: 'citywide', metric: 'homesSold', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Yu-u0O.csv' },
  { type: 'citywide', metric: 'homesSold', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6YX-s3M.csv' },

  { type: 'priceRange', metric: 'dom', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/N6Fd-8LO.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoY1-sg9.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHQ-Cnz.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHm-2yd.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHZ-lEa.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHj-fVZ.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHY-WbN.csv' },
  { type: 'priceRange', metric: 'dom', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHH-V61.csv' },

  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHO-b30.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHy-rv1.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHD-yqn.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHK-i4q.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoH1-NkQ.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHi-00l.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHU-4IT.csv' },
  { type: 'priceRange', metric: 'homesForSale', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHW-vIu.csv' },

  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHI-zcw.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHe-iyf.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoH0-SJ7.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoHG-p9H.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFt-thy.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFd-rnh.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFQ-t4Q.csv' },
  { type: 'priceRange', metric: 'pendingSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFb-LaJ.csv' },

  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFH-tos.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFO-8Es.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFy-Vgn.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFD-IZw.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFJ-Gb0.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFW-ybY.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoFk-MYX.csv' },
  { type: 'priceRange', metric: 'closedSales', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoF9-sLr.csv' },

  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoE3-773.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '200-299', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEl-8Nd.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEf-mI1.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '300-399', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEH-Ga9.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEw-DDo.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '400-499', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEu-ghu.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEs-1vu.csv' },
  { type: 'priceRange', metric: 'monthsSupply', priceRangeKey: '500-plus', url: 'https://mlsok.stats.showingtime.com/infoserv/s-v1/NoEz-49t.csv' }
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function seoForCity(city) {
  return {
    pageTitle: `How Long Does It Take to Sell a Home in ${city}, OK?`,
    seoTitle: `${city} OK Average Days to Sell a Home`,
    seoDescription: `See how long homes are taking to sell in ${city}, Oklahoma, including days on market, market speed, competition, and available price-range data when available.`,
    futureUrl: `/days-to-sell/${slugify(city)}`
  };
}

function parseFredCsv(csv) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);

  return lines.slice(1).map(line => {
    const [date, value] = line.split(',');
    return { date, value: value === '.' ? null : Number(value) };
  }).filter(row => row.value !== null && Number.isFinite(row.value));
}

function monthLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function getSpeed(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return 'Unknown';
  if (n <= 49) return 'Fast';
  if (n >= 50 && n <= 60) return 'Normal';
  return 'Slower';
}

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

function createCityRecord(city, options = {}) {
  const seo = seoForCity(city);

  return {
    city,
    slug: slugify(city),
    state: 'OK',
    marketName: `${city} Housing Market`,
    dataTier: options.dataTier || 'basic',
    isFullMlsokCity: options.dataTier === 'full',
    sourceName: options.sourceName || 'FRED / Realtor.com Housing Inventory',
    sourceUrl: options.sourceUrl || '',
    publicMarketName: options.publicMarketName || null,
    latestDate: options.latestDate || null,
    latestDateLabel: options.latestDateLabel || null,
    dataFrom: options.dataFrom || null,
    medianDaysOnMarket: options.medianDaysOnMarket ?? null,
    previousYearDaysOnMarket: options.previousYearDaysOnMarket ?? null,
    previousMonthDaysOnMarket: options.previousMonthDaysOnMarket ?? null,
    medianSalePrice: options.medianSalePrice ?? null,
    previousYearMedianSalePrice: options.previousYearMedianSalePrice ?? null,
    homesSold: options.homesSold ?? null,
    previousYearHomesSold: options.previousYearHomesSold ?? null,
    speed: options.speed || getSpeed(options.medianDaysOnMarket),
    priceRanges: options.priceRanges || [],
    ...seo
  };
}

function getCityRecord(records, city) {
  if (!records.has(city)) {
    records.set(city, createCityRecord(city));
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

async function fetchFredSeries(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;

  const response = await fetch(url, {
    headers: { 'user-agent': 'KerrTeamMarketDataBot/3.0' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${seriesId}: ${response.status} ${response.statusText}`);
  }

  return parseFredCsv(await response.text());
}

async function applyBasicPublicData(records) {
  for (const publicMarket of BASIC_PUBLIC_MARKETS) {
    try {
      const rows = await fetchFredSeries(publicMarket.seriesId);
      const latest = rows.at(-1);
      const previousMonth = rows.at(-2);
      const priorYearDate = latest.date.replace(
        /^([0-9]{4})/,
        String(Number(latest.date.slice(0, 4)) - 1)
      );
      const previousYearRow = rows.find(row => row.date === priorYearDate);

      const latestValue = Math.round(latest.value);
      const previousYearValue = previousYearRow ? Math.round(previousYearRow.value) : null;
      const previousMonthValue = previousMonth ? Math.round(previousMonth.value) : null;

      for (const city of publicMarket.cities) {
        if (records.has(city)) continue;

        records.set(city, createCityRecord(city, {
          dataTier: 'basic',
          sourceName: publicMarket.sourceName,
          sourceUrl: publicMarket.sourceUrl,
          publicMarketName: publicMarket.marketName,
          latestDate: latest.date,
          latestDateLabel: monthLabel(latest.date),
          medianDaysOnMarket: latestValue,
          previousYearDaysOnMarket: previousYearValue,
          previousMonthDaysOnMarket: previousMonthValue,
          speed: getSpeed(latestValue),
          priceRanges: []
        }));
      }

      console.log(`Loaded public basic data for ${publicMarket.marketName}`);
    } catch (error) {
      console.error(`ERROR: ${publicMarket.marketName}`);
      console.error(error.message);
    }
  }
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

async function fetchMlsokReport(report) {
  const response = await fetch(report.url, {
    headers: { 'user-agent': 'KerrTeamMarketDataBot/3.0' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${report.url}: ${response.status} ${response.statusText}`);
  }

  return parseShowingTimeCsv(await response.text());
}

function markFullMlsokCity(cityRecord, report, parsed, latest) {
  cityRecord.dataTier = 'full';
  cityRecord.isFullMlsokCity = true;
  cityRecord.sourceName = 'MLSOK / ShowingTime';
  cityRecord.sourceUrl = report.url;
  cityRecord.latestDate = latest.date.isoDate;
  cityRecord.latestDateLabel = latest.date.label;
  cityRecord.dataFrom = parsed.dataFrom;
}

function applyCitywideMetric(records, report, parsed) {
  const latest = parsed.rows[parsed.rows.length - 1];
  const prior = previousYearRow(parsed.rows, latest.date);

  for (const city of parsed.cities) {
    const cityRecord = getCityRecord(records, city);
    const currentValue = roundMetric(report.metric, latest.values[city]);
    const previousYearValue = prior ? roundMetric(report.metric, prior.values[city]) : null;

    markFullMlsokCity(cityRecord, report, parsed, latest);

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
    const cityRecord = getCityRecord(records, city);
    const range = getPriceRangeRecord(cityRecord, report.priceRangeKey);
    const currentValue = roundMetric(report.metric, latest.values[city]);
    const previousYearValue = prior ? roundMetric(report.metric, prior.values[city]) : null;

    markFullMlsokCity(cityRecord, report, parsed, latest);

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

async function applyMlsokFullData(records) {
  for (const report of MLSOK_REPORTS) {
    try {
      const parsed = await fetchMlsokReport(report);

      if (report.type === 'citywide') {
        applyCitywideMetric(records, report, parsed);
      } else {
        applyPriceRangeMetric(records, report, parsed);
      }

      console.log(`Loaded MLSOK ${report.type} ${report.metric}${report.priceRangeKey ? ` ${report.priceRangeKey}` : ''}`);
    } catch (error) {
      console.error(`ERROR: ${report.url}`);
      console.error(error.message);
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

function finalizeMarkets(records) {
  return Array.from(records.values())
    .map(market => ({
      ...market,
      marketName: `${market.city} Housing Market`,
      cities: [market.city],
      priceRanges: market.priceRanges.sort((a, b) => priceRangeOrder(a.key) - priceRangeOrder(b.key))
    }))
    .sort((a, b) => {
      const aFull = FULL_MLSOK_CITIES.includes(a.city) ? 0 : 1;
      const bFull = FULL_MLSOK_CITIES.includes(b.city) ? 0 : 1;

      if (aFull !== bFull) return aFull - bFull;

      return a.city.localeCompare(b.city);
    });
}

function validateMarkets(markets) {
  const warnings = [];
  const fullMarkets = markets.filter(market => market.dataTier === 'full');

  for (const market of fullMarkets) {
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

  await applyBasicPublicData(records);
  await applyMlsokFullData(records);

  const markets = finalizeMarkets(records);
  const warnings = validateMarkets(markets);

  if (warnings.length) {
    console.warn('\nData warnings:');
    warnings.forEach(warning => console.warn(`- ${warning}`));
  }

  const output = {
    generatedAt,
    dataMode: 'hybrid-public-basic-mlsok-full-city-seo-ready',
    brand,
    metric: 'Hybrid market data: public basic city coverage plus MLSOK full price-range snapshots for upgraded cities',
    note: 'Basic cities use public FRED / Realtor.com metro-level median days on market. Full cities use MLSOK / ShowingTime city and price-range data. Days on Market reflects recently sold homes; Homes for Sale reflects current competition.',
    fullMlsokCities: FULL_MLSOK_CITIES,
    priceRanges: PRICE_RANGES,
    markets
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\nWrote ${OUTPUT_PATH} with ${markets.length} city records.`);
  console.log(`Full MLSOK cities: ${markets.filter(m => m.dataTier === 'full').length}`);
  console.log(`Basic public cities: ${markets.filter(m => m.dataTier === 'basic').length}`);
  console.log(`Data mode: ${output.dataMode}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
