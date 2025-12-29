// data.js - 線上同步版

// -------------------------------------------------------------
// ⭐️ 核心修改：將網址貼在下面，以後你只要改表格，遊戲就會自動更新 ⭐️
// -------------------------------------------------------------

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1xeU9xsHju09DfkXMx7n2Z3576R9JXAjqHhVgylg8TSg/export?format=csv'; 

const WORD_DB_KEY = 'learningFarmWordDB';
const FARM_STATE_KEY = 'learningFarmState';

// 預設田地狀態 (5x5 = 25 塊田)
const DEFAULT_FARM_STATE = Array(25).fill(null).map((_, index) => ({
    id: index + 1,
    isPlanted: false,
    wordIds: [], 
    plantDate: null
}));

/**
 * ⭐️ 新增：從網路抓取 CSV 並轉成原本 RAW_WORDS 的物件格式
 */
async function fetchRawWordsFromSheets() {
    try {
        // 使用 cache: "no-store" 確保每次重新整理網頁都能抓到最新的試算表內容
        const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("網路回應不正常");

        // 強制使用 text() 解析，fetch 預設會處理 UTF-8 編碼，解決中文亂碼問題
        const csvText = await response.text();
        
        // 解析 CSV 行（考慮到 Windows 與 Mac 的換行符號不同）
        const rows = csvText.split(/\r?\n/).filter(row => {
            const trimmed = row.trim();
            // 跳過空行，且跳過以 # 字號開頭的行 (註解行)
            return trimmed !== '' && !trimmed.startsWith('#') && !trimmed.startsWith('"#');
        });
        
        const rawWords = rows.slice(1).map(row => {
            /**
             * ⭐️ 關鍵修正：處理包含逗號的中文
             * 有些中文意思會有逗號（如：n., 取得），直接用 split(',') 會切錯。
             * 改用更嚴謹的 CSV 分隔邏輯。這個正則表達式會：
             * 1. 優先抓取包含在雙引號內的內容 ("...")
             * 2. 如果沒引號，則抓取直到遇到下一個逗號之前的「所有字元」(包含空白)
             */
            const cols = row.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
            
            if (cols && cols.length >= 2) {
                return {
                    // 移除可能的雙引號並清除空白
                    word: cols[0].replace(/^"|"$/g, '').trim() || "",
                    meaning: cols[1].replace(/^"|"$/g, '').trim() || ""
                };
            }
            return null;
        }).filter(w => w && w.word !== "");// 過濾空行

        console.log("✅ 單字庫抓取成功！數量：", rawWords.length);
        return rawWords;
    } catch (e) {
        console.error("❌ 無法抓取線上單字庫，請檢查網址或網路:", e);
        return []; // 失敗則返回空陣列
    }
}

// ------------------- 資料處理函數 -------------------

/**
 * 根據 rawWords 建立一個帶有完整屬性的乾淨單字資料庫。
 */
function createDefaultWordDatabase(rawWords) {
    return rawWords.map((rawWord, index) => {
        // 賦予單字遊戲所需的初始屬性
        return {
            id: index + 1, // 根據 RAW_WORDS 的索引自動生成 ID
            word: rawWord.word,
            meaning: rawWord.meaning,
            learned: false,
            // 根據您的需求添加的考試追蹤屬性
            correctCount: 0, 
            totalAttempts: 0 
        };
    });
}

/**
 * 從 localStorage 載入資料，並處理新加入的單字。
 * @returns {object} 包含 wordDB 和 farmState 的物件。
 */
async function loadGameData() {
    const storedWords = localStorage.getItem(WORD_DB_KEY);
    const storedFarm = localStorage.getItem(FARM_STATE_KEY);
    
    // 1. 先從網路上抓取最新的單字清單
    const fetchedRawWords = await fetchRawWordsFromSheets();
    
    // 2. 建立新的預設資料庫
    const newDefaultDB = createDefaultWordDatabase(fetchedRawWords);
    
    let wordDB = newDefaultDB;
    let farmState = storedFarm ? JSON.parse(storedFarm) : DEFAULT_FARM_STATE;
    
    // 2. 如果存在舊的存檔
    if (storedWords && newDefaultDB.length > 0) {
        const storedDB = JSON.parse(storedWords);
        
        // 3. 合併邏輯：使用新的單字列表，但保留舊單字的遊戲狀態
        wordDB = newDefaultDB.map(newWord => {
            const oldWord = storedDB.find(sw => sw.word === newWord.word);
            
            // 如果舊存檔中存在這個單字，則覆蓋其狀態數據
            if (oldWord) {
                return {
                    ...newWord, // 確保使用新的 ID 和 Word/Meaning
                    learned: oldWord.learned || false,
                    correctCount: oldWord.correctCount || 0,
                    totalAttempts: oldWord.totalAttempts || 0
                };
            }
            // 否則，使用全新的單字狀態
            return newWord;
        });
        
        console.log("資料庫已合併：自動新增單字並保留舊進度。");
    }

    return { wordDB, farmState };
}

/**
 * 將最新的資料儲存到 localStorage。
 * @param {Array} wordDB - 最新的單字資料庫。
 * @param {Array} farmState - 最新的田地狀態。
 */
function saveGameData(wordDB, farmState) {
    try {
        localStorage.setItem(WORD_DB_KEY, JSON.stringify(wordDB));
        localStorage.setItem(FARM_STATE_KEY, JSON.stringify(farmState));
        console.log("遊戲進度已儲存到 LocalStorage。");
    } catch (e) {
        console.error("儲存進度失敗:", e);
    }
}

/**
 * 取得 10 個未學習的單字 ID。
 * @param {Array} wordDB - 當前的單字資料庫。
 * @returns {Array} 10 個單字 ID。
 */
function getTenUnlearnedWords(wordDB) {
    // 這裡我們優化為：未學習 (learned: false) 或答對率低於 70% 且嘗試過 3 次以上的單字
    const eligibleWords = wordDB.filter(w => {
        const accuracy = w.totalAttempts > 0 ? w.correctCount / w.totalAttempts : 0;
        
        // 未學習的單字 (優先)
        if (w.learned === false) return true;
        
        // 已學習但答對率不佳的單字 (作為復習的後備資源)
        if (w.totalAttempts >= 3 && accuracy < 0.7) return true;
        
        return false;
    });
    
    // 隨機選取 10 個。如果不足 10 個，則全部選取。
    const selection = eligibleWords.sort(() => 0.5 - Math.random()).slice(0, 10);
    
    return selection.map(w => w.id);

}






