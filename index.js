const { google } = require('googleapis');
const fetch = require('node-fetch');

// Конфигурация
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'RAW_DATA';

// Список монет
const symbols = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AXSUSDT', 'BSBUSDT',
  'ORCAUSDT', 'AVAXUSDT', 'HYPERUSDT', 'DOGEUSDT', 'BNBUSDT'
];

// Авторизация Google Sheets через Service Account
async function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDS_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return auth;
}

// Получение данных с Binance (обычный API, не Binance.US!)
async function fetchFromBinance(symbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=30`;
  const response = await fetch(url);
  const data = await response.json();
  
  const results = [];
  for (const candle of data) {
    const date = new Date(candle[0]);
    const dateStr = date.toISOString().split('T')[0];
    const volumeUSDT = parseFloat(candle[7]); // Quote volume в USDT
    results.push([dateStr, symbol, volumeUSDT]);
  }
  return results;
}

// Основная функция
async function main() {
  console.log('🚀 Запуск скрипта...');
  
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  
  let allData = [];
  
  for (const symbol of symbols) {
    try {
      console.log(`📥 Загрузка ${symbol}...`);
      const data = await fetchFromBinance(symbol);
      allData = allData.concat(data);
      console.log(`✅ ${symbol}: ${data.length} записей`);
      // Пауза между запросами
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Ошибка ${symbol}:`, error.message);
    }
  }
  
  if (allData.length > 0) {
    // Очищаем старые данные
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:C`
    });
    
    // Записываем новые данные
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: allData }
    });
    
    console.log(`📊 Загружено ${allData.length} записей в таблицу`);
  }
  
  console.log('✨ Готово!');
}

main().catch(console.error);