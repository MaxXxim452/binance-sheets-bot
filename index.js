const { google } = require('googleapis');
const fetch = require('node-fetch');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'RAW_DATA';

// Монеты (BSBUSDT нет в Binance, убрал)
const symbols = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AXSUSDT',
  'ORCAUSDT', 'AVAXUSDT', 'HYPERUSDT', 'DOGEUSDT', 'BNBUSDT'
];

async function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDS_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return auth;
}

async function ensureSheetExists(sheets) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });
    
    const sheetExists = spreadsheet.data.sheets.some(
      sheet => sheet.properties.title === SHEET_NAME
    );
    
    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: SHEET_NAME,
                gridProperties: { frozenRowCount: 1 }
              }
            }
          }]
        }
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:C1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Date', 'Symbol', 'Volume']]
        }
      });
      
      console.log('📝 Создан новый лист RAW_DATA');
    }
  } catch (error) {
    console.error('Ошибка при проверке листа:', error.message);
  }
}

async function fetchFromBinance(symbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=30`;
  const response = await fetch(url);
  const data = await response.json();
  
  const results = [];
  for (const candle of data) {
    const date = new Date(candle[0]);
    const dateStr = date.toISOString().split('T')[0];
    // Заменяем запятую на точку, потом в число
    let volumeUSDT = parseFloat(candle[7].toString().replace(',', '.'));
    // Если NaN, пробуем как есть
    if (isNaN(volumeUSDT)) {
      volumeUSDT = parseFloat(candle[7]);
    }
    results.push([dateStr, symbol, volumeUSDT]);
  }
  return results;
}

async function updateTimestamp(sheets) {
  const now = new Date();
  const timestamp = `✅ Обновлено: ${now.toLocaleString()}`;
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!E1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[timestamp]]
    }
  });
  console.log(`📝 Обновлен timestamp: ${timestamp}`);
}

async function main() {
  console.log('🚀 Запуск скрипта...');
  
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  
  await ensureSheetExists(sheets);
  
  let allData = [];
  
  for (const symbol of symbols) {
    try {
      console.log(`📥 Загрузка ${symbol}...`);
      const data = await fetchFromBinance(symbol);
      allData = allData.concat(data);
      console.log(`✅ ${symbol}: ${data.length} записей`);
      await new Promise(resolve => setTimeout(resolve, 500));
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
      requestBody: { values: allData }
    });
    
    // Обновляем timestamp в ячейке E1
    await updateTimestamp(sheets);
    
    console.log(`📊 Загружено ${allData.length} записей в таблицу`);
  }
  
  console.log('✨ Готово!');
}

main().catch(console.error);
