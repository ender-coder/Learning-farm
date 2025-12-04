// data.js - 優化版：簡化單字輸入

// -------------------------------------------------------------
// ⭐️ 核心優化：只需要輸入單字和中文意思即可 ⭐️
// -------------------------------------------------------------
const RAW_WORDS = [
    { word: "acquisition", meaning: "取得" },
    { word: "admonish", meaning: "警告；責備" },
    { word: "adorn", meaning: "裝飾" },
    { word: "alma mater", meaning: "母校" },
    { word: "altitude", meaning: "高度" },
    { word: "amateur", meaning: "業餘的" },
    { word: "annihilate", meaning: "抵銷" },
    { word: "applaud", meaning: "讚譽" },
    { word: "arrogant", meaning: "傲慢的" },
    { word: "aviator", meaning: "飛行員" },
    { word: "calcium", meaning: "鈣" },
    { word: "chant", meaning: "吟唱" },
    
    // ⭐ 優化後，您可以這樣輕鬆擴充資料庫：
    { word: "unilateral", meaning: "單方面的" }, 
    { word: "optimize", meaning: "優化" },
    { word: "audit", meaning: "審計；查帳" },
    { word: "accounting", meaning: "會計" },
    { word: "budget", meaning: "預算" },
    { word: "curtail", meaning: "縮減；削減" },
    { word: "deficit", meaning: "赤字；不足額" },
    { word: "substantially", meaning: "大大地；相當多地" },
    { word: "committee", meaning: "委員會" },
    { word: "reimburse", meaning: "補償；核銷" },
    { word: "allocate", meaning: "分配；分派" },
    { word: "quarter", meaning: "季度" },
    { word: "prompt", meaning: "導致；促使" },
    { word: "deduct", meaning: "扣除；減除" },
    { word: "amend", meaning: "修正" },
    { word: "exempt", meaning: "被免除的" },
    { word: "deficient", meaning: "不足的；缺乏的" },
    { word: "fortunate", meaning: "幸運的" },
    { word: "expenditure", meaning: "支出；開支" },
    { word: "accurately", meaning: "精確地" },
    { word: "excess", meaning: "超過；過量" },
    { word: "fiscal", meaning: "會計的；財政的" },
    { word: "incidental", meaning: "附帶的" },
    { word: "inflation", meaning: "通貨膨脹" },
    { word: "liable", meaning: "富有責任的；很可能會~的" },
    { word: "turnover", meaning: "營業額；交易額；人事異動率" },
    { word: "foresee", meaning: "預見；預知" },
    { word: "relocate", meaning: "搬遷(工廠等)" },
    { word: "asset", meaning: "資產" },
    { word: "dedicated", meaning: "專注的；奉獻的" },
    { word: "misplace", meaning: "放在想不起來的地方" },
    { word: "considerable", meaning: "相當大的；相當多的" },
    { word: "last", meaning: "持續" },
    { word: "emerge", meaning: "出現；浮現" },
    { word: "imply", meaning: "意味著" },
    { word: "vital", meaning: "必要的" },
    { word: "persist", meaning: "堅持；持續" },
    { word: "force", meaning: "勢力；有影響力的人" },
    { word: "establish", meaning: "創立；建立" },
    { word: "initiate", meaning: "開始實施" },
    { word: "renowned", meaning: "著名的" },
    { word: "informed", meaning: "了解情況的；消息靈通的" },
    { word: "minutes", meaning: "會議記錄" },
    { word: "waive", meaning: "放棄；免除" },
    { word: "authority", meaning: "權力；當局" },
    { word: "acquire", meaning: "取得；收購" },
    { word: "surpass", meaning: "超越；勝過" },
    { word: "run", meaning: "經營；營運" },
    { word: "improbable", meaning: "不太可能的" },
    { word: "edge", meaning: "優勢" },
    { word: "simultaneously", meaning: "同時地" },
    { word: "premier", meaning: "第一的；首要的" },
    { word: "plant", meaning: "工廠" },
    { word: "agenda", meaning: "議程；代辦事項" },
    { word: "convene", meaning: "聚集；集會；召開" },
    /*{ word: "", meaning: "" },
    { word: "", meaning: "" },
    { word: "", meaning: "" },*/
    // 請在這裡自行擴充更多的單字...
];

// 預設田地狀態 (5x5 = 25 塊田)
const DEFAULT_FARM_STATE = Array(25).fill(null).map((_, index) => ({
    id: index + 1,
    isPlanted: false,
    wordIds: [], 
    plantDate: null
}));

const WORD_DB_KEY = 'learningFarmWordDB';
const FARM_STATE_KEY = 'learningFarmState';

// ------------------- 資料處理函數 -------------------

/**
 * 根據 RAW_WORDS 建立一個帶有完整屬性的乾淨單字資料庫。
 */
function createDefaultWordDatabase() {
    return RAW_WORDS.map((rawWord, index) => {
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
function loadGameData() {
    const storedWords = localStorage.getItem(WORD_DB_KEY);
    const storedFarm = localStorage.getItem(FARM_STATE_KEY);

    // 1. 取得最新且完整的預設資料庫
    const newDefaultDB = createDefaultWordDatabase();
    
    let wordDB = newDefaultDB;
    let farmState = storedFarm ? JSON.parse(storedFarm) : DEFAULT_FARM_STATE;
    
    // 2. 如果存在舊的存檔
    if (storedWords) {
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