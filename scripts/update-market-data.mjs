import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCES = {
  sp500: {
    indexName: '标普500',
    indicator: 'VIX',
    url: 'https://cdn-api.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv'
  },
  nasdaq100: {
    indexName: '纳斯达克100',
    indicator: 'VXN',
    url: 'https://cdn-api.cboe.com/api/global/us_indices/daily_prices/VXN_History.csv'
  }
};

function parseDate(value) {
  const [month, day, year] = value.trim().split('/').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseCsv(csv) {
  return csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close] = line.split(',');
    return {
      date: parseDate(date),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close)
    };
  }).filter((row) => Number.isFinite(row.close)).sort((a, b) => a.date - b.date);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function tierFor(percentile) {
  if (percentile <= 20) return { multiplier: 0.75, sentiment: '极度平静', tier: 'very-calm' };
  if (percentile <= 40) return { multiplier: 0.90, sentiment: '偏平静', tier: 'calm' };
  if (percentile <= 60) return { multiplier: 1.00, sentiment: '正常', tier: 'normal' };
  if (percentile <= 80) return { multiplier: 1.20, sentiment: '偏恐慌', tier: 'uneasy' };
  if (percentile <= 95) return { multiplier: 1.50, sentiment: '高度恐慌', tier: 'fearful' };
  return { multiplier: 1.75, sentiment: '极端恐慌', tier: 'extreme' };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(source, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(source.url, {
        headers: { 'user-agent': 'compound-return-calculator/1.0' },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = [2000, 5000, 10000][attempt - 1];
        console.warn(`${source.indicator} 第 ${attempt} 次下载失败，${delay / 1000} 秒后重试。`);
        await wait(delay);
      }
    }
  }
  throw new Error(`${source.indicator} 下载失败：${lastError?.message || '未知网络错误'}`);
}

async function fetchSeries(source) {
  const response = await fetchWithRetry(source);

  const rows = parseCsv(await response.text());
  if (rows.length < 2) throw new Error(`${source.indicator} 数据不足`);
  const latest = rows.at(-1);
  const previous = rows.at(-2);
  const windowStart = new Date(latest.date);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 5);
  const windowRows = rows.filter((row) => row.date >= windowStart && row.date <= latest.date);
  const rank = windowRows.filter((row) => row.close <= latest.close).length;
  const percentile = round(rank / windowRows.length * 100, 1);
  const tier = tierFor(percentile);

  return {
    indexName: source.indexName,
    indicator: source.indicator,
    asOf: latest.date.toISOString().slice(0, 10),
    close: round(latest.close),
    previousAsOf: previous.date.toISOString().slice(0, 10),
    previousClose: round(previous.close),
    changePercent: round((latest.close / previous.close - 1) * 100),
    percentile5y: percentile,
    sampleSize: windowRows.length,
    multiplier: tier.multiplier,
    sentiment: tier.sentiment,
    tier: tier.tier
  };
}

const markets = {};
for (const [key, source] of Object.entries(SOURCES)) {
  markets[key] = await fetchSeries(source);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'data');
const outputPath = path.join(outputDir, 'market-sentiment.json');
let generatedAt = new Date().toISOString();

try {
  const previous = JSON.parse(await readFile(outputPath, 'utf8'));
  if (JSON.stringify(previous.markets) === JSON.stringify(markets) && previous.generatedAt) {
    generatedAt = previous.generatedAt;
  }
} catch (_) {
  // 首次运行时没有旧文件，直接生成新数据。
}

const output = {
  schemaVersion: 1,
  generatedAt,
  methodology: {
    window: '5年交易日',
    percentile: '当前收盘值在近5年每日收盘值中的经验分位',
    tiers: [
      { maxPercentile: 20, multiplier: 0.75 },
      { maxPercentile: 40, multiplier: 0.90 },
      { maxPercentile: 60, multiplier: 1.00 },
      { maxPercentile: 80, multiplier: 1.20 },
      { maxPercentile: 95, multiplier: 1.50 },
      { maxPercentile: 100, multiplier: 1.75 }
    ]
  },
  updatePolicy: {
    timezone: 'America/New_York',
    scheduledLocalTime: '17:30',
    backupLocalTime: '19:17',
    chinaDaylightTime: '次日 05:30',
    chinaStandardTime: '次日 06:30',
    browserRefreshMinutes: 15
  },
  source: {
    name: 'Cboe Global Markets',
    page: 'https://www.cboe.com/tradable_products/vix/vix_historical_data',
    vixCsv: SOURCES.sp500.url,
    vxnCsv: SOURCES.nasdaq100.url
  },
  markets
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

for (const market of Object.values(markets)) {
  console.log(`${market.indicator}: ${market.close}，5年分位 ${market.percentile5y}% → ${market.multiplier.toFixed(2)}x`);
}

