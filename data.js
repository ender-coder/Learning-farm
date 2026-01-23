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

        // 強制使用 text() 解析，處理 UTF-8 編碼
        const csvText = await response.text();
        
        // 分割行 (考慮到 Windows 與 Mac 的換行符號不同)
        const rows = csvText.split(/\r?\n/);
        
        // 從第一列之後開始處理 (假設第一列是標題)
        const allRowsData = rows.slice(1).map((row, index) => {
            const trimmedRow = row.trim();
            if (!trimmedRow) return { type: 'COMMENT', rawRow: [""] };
            
            // 1. 使用正則拆解 CSV 欄位，處理包含逗號的引號字串
            // 這個正則會將 "Apple, Red", Fruit 拆分為 ["Apple, Red", "Fruit"]
            const cols = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());

            // 2. 定義「有效單字」的嚴格條件：
            // 🏆 關鍵修正：只有當第一欄跟第二欄同時有值時，才視為單字
            // 這樣你在第三欄寫東西，前兩欄空著，就會被判定為 COMMENT
            const isPoundComment = trimmedRow.startsWith('#') || trimmedRow.startsWith('"#');
            const english = cols[0] || ""; // 防止第二欄沒填導致錯誤
            const chinese = cols[1] || ""; // 防止第二欄沒填導致錯誤

            if (english !== "" && chinese !== "" && !isPoundComment) {
                // ✅ 合法的單字行
                return {
                    type: 'WORD',
                    id: `sheet-${index}`, // 給予唯一 ID 方便追蹤
                    word: english,
                    meaning: chinese,
                    rawRow: cols // 儲存原始拆分結果，供匯出使用
                };
            } else {
                // ❌ 註解行、空行、或第一格沒寫單字的行
                return {
                    type: 'COMMENT',
                    rawRow: [row] // 直接存下整行原始字串，確保匯出時格式不變
                };
            }
        });

        console.log("✅ 原始資料抓取成功，有效單字與註解總數：", allRowsData.length);
        return allRowsData;
    } catch (e) {
        console.error("❌ 無法抓取線上單字庫:", e);
        return [];
    }
}

// ------------------- 資料處理函數 -------------------

/**
 * 根據 rawRows 建立一個帶有完整屬性的乾淨單字資料庫。
 */
function createDefaultWordDatabase(rawRows) {
    let wordIdCounter = 1;
    return rawRows.map((item) => {
        if (item.type === 'WORD') {
            return {
                ...item,
                id: wordIdCounter++, // 只有單字有 ID
                learned: false,
                correctCount: 0, 
                totalAttempts: 0 
            };
        }
        return item; // COMMENT 類型原樣返回
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

/**
 * ⭐️ 新增：將單字標記為熟練並導出 CSV (對應原始 Excel 欄位)
 * @param {Array<number>} wordIdsToExport - 要處理的單字 ID 列表
 * @param {Array<object>} currentWordDB - 遊戲目前的單字資料庫
 */
function exportMasteredWordsToCSV(wordIdsToExport, wordDB) {
    if (wordIdsToExport.length === 0) return;

    if (!confirm(`確定要將這 ${wordIdsToExport.length} 個單字畢業並下載新的 CSV 嗎？`)) return;

    const csvRows = wordDB.map(wordObj => {
        // 如果是註解或空行，直接原樣輸出
        if (wordObj.type === 'COMMENT') {
            return wordObj.rawRow[0];
        }

        // 如果是單字行
        let columns = [...(wordObj.rawRow || [])];

        if (wordIdsToExport.includes(wordObj.id)) {
            const english = wordObj.word;
            const chinese = wordObj.meaning;
            
            columns[0] = ""; 
            columns[1] = "";

            let targetIdx = 2;
            while (columns[targetIdx] && columns[targetIdx].trim() !== "" && columns[targetIdx] !== '""') {
                targetIdx++;
            }
            columns[targetIdx] = `[Mastered]`;
            columns[targetIdx+1] = english;
            columns[targetIdx+2] = chinese;
        }
        
        return columns.map(cell => {
            let s = cell ? cell.toString().replace(/^"|"$/g, '').trim() : "";
            return s.includes(",") ? `"${s}"` : s;
        }).join(",");
    });

    // 重新合成 CSV (假設保留原始標題)
    const header = "English,Chinese,Note/Archive";
    const finalContent = "\ufeff" + [header, ...csvRows].join("\r\n");

    const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `farm_full_backup_${new Date().getMonth()+1}${new Date().getDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
