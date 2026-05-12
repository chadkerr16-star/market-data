import fs from 'node:fs/promises';
import path from 'node:path';

const configPath = path.join(process.cwd(), 'data', 'market-config.json');
const outputPath = path.join(process.cwd(), 'market-data.json');
const historyPath = path.join(process.cwd(), 'market-history.json');

function parseFredCsv(csv) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1).map(line => {
    const [date, value] = line.split(',');
    return { date, value: value === '.' ? null : Number(value) };
  }).filter(row => row.value !== null && !Number.isNaN(row.value));
  return rows;
}

function monthLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function marketSpeed(days) {
  if (days <= 45) return 'Fast';
  if (days <= 65) return 'Normal';
  return 'Slower';
}

function sellerInsight(days, marketName) {
  if (days <= 45) {
    return `${marketName} is moving relatively quickly. Well-priced homes may attract buyer activity faster, but condition and pricing still matter.`;
  }
  if (days <= 65) {
    return `${marketName} is moving at a more normal pace. Sellers should expect buyers to compare price, condition, and value carefully.`;
  }
  return `${marketName} is taking longer to move. Strong pricing, preparation, and marketing can make a meaningful difference.`;
}

async function fetchSeries(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const response = await fetch(url, { headers: { 'user-agent': 'KerrTeamDaysToSellBot/1.0' } });
  if (!response.ok) throw new Error(`Failed to fetch ${seriesId}: ${response.status} ${response.statusText}`);
  const csv = await response.text();
  return parseFredCsv(csv);
}

async function main() {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const generatedAt = new Date().toISOString();
  const markets = [];
  const history = {};

  for (const market of config.markets) {
    try {
      const rows = await fetchSeries(market.seriesId);
      const latest = rows.at(-1);
      const previousYearRow = rows.find(row => row.date === latest.date.replace(/^([0-9]{4})/, String(Number(latest.date.slice(0, 4)) - 1)));
      const previousMonth = rows.at(-2);

      const latestValue = Math.round(latest.value);
      const previousYearValue = previousYearRow ? Math.round(previousYearRow.value) : null;
      const previousMonthValue = previousMonth ? Math.round(previousMonth.value) : null;

      markets.push({
        marketName: market.marketName,
        state: market.state,
        cities: market.cities,
        medianDaysOnMarket: latestValue,
        previousYearDaysOnMarket: previousYearValue,
        previousMonthDaysOnMarket: previousMonthValue,
        latestMonth: latest.date,
        latestMonthLabel: monthLabel(latest.date),
        speed: marketSpeed(latestValue),
        insight: sellerInsight(latestValue, market.marketName),
        sourceName: market.sourceName,
        sourceUrl: market.sourceUrl,
        seriesId: market.seriesId
      });

      history[market.marketName] = rows.slice(-24);
    } catch (error) {
      console.error(error.message);
    }
  }

  const output = {
    generatedAt,
    brand: config.brand,
    metric: 'Median Days on Market',
    note: 'This is automated public monthly market data. City searches may map to the surrounding metro when city-level public data is unavailable.',
    markets
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  await fs.writeFile(historyPath, JSON.stringify({ generatedAt, history }, null, 2));
  console.log(`Wrote ${outputPath} with ${markets.length} markets.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
