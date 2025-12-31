// game.js - 最終版本：整合學習、複習、考試、錯字追蹤 (新增填空題)
let currentWordDB;
let currentFarmState;

// ⭐️ NEW: 追蹤目前正在進行學習/考試的地塊和單字
let currentPlotIndex = -1; 
let currentExamWordIds = [];

// ⭐️ NEW GLOBAL VARIABLE (保留，用來傳遞多選題結果)
let multipleChoiceResults = {}; // 儲存 { wordId: isCorrect (boolean), ... }

// ⭐️ NEW: 熟練度門檻（10題的平均正確率）
const MASTERY_THRESHOLD = 0.7; // 70%

// -------------------------------------------------------------
// !! 輔助函數 !!
// -------------------------------------------------------------

function clearGameData() {
    if (confirm("警告：這將清除所有遊戲進度，確定要重置嗎？")) {
        localStorage.removeItem('learningFarmWordDB');
        localStorage.removeItem('learningFarmState');
        window.location.reload(true); 
    }
}

/**
 * 隨機打亂陣列
 * @param {Array<any>} array 
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * 🛠 輔助函式：重設並顯示 Modal，防止舊內容殘留
 * @param {string} title - 視窗標題
 */
function prepareModal(title) {
    const modal = document.getElementById('word-modal');
    const listContainer = document.getElementById('word-list-container');
    const titleElement = modal.querySelector('h2');

    // 1. 先清空所有舊內容
    listContainer.innerHTML = '<p style="text-align:center; padding:20px;">載入中...</p>';
    titleElement.textContent = title;
    
    // 2. 顯示視窗
    modal.style.display = 'block';
    
    return listContainer;
}

/**
 * 🔊 執行單字發音
 * @param {string} text - 要發音的單字
 */
function speakWord(text) {
    if (!window.speechSynthesis) {
        alert("抱歉，您的瀏覽器不支援語音功能。");
        return;
    }
    // 停止目前正在播放的聲音
    window.speechSynthesis.cancel();
    
    // 延遲一小段時間再播放，確保 cancel 完全生效 (某些瀏覽器 bug)
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; // 設定為美式英文
        utterance.rate = 0.8; // 語速稍慢一點，方便聽清楚
        utterance.volume = 1.0; // 確保音量最大
        window.speechSynthesis.speak(utterance);
    }, 50);
}

/**
 * ⭐️ NEW: 計算並更新遊戲主介面的單字統計資訊。
 */
function updateStatisticsDisplay() {
    if (!currentWordDB) return;
    
    // ⭐️ 修正：過濾掉註解與空行，只計算真正的單字
    const allWords = currentWordDB.filter(w => w.type === 'WORD');
    
    // 總單字數
    const totalWords = allWords.length;
    
    // 已出題數 (已經歷學習階段，即 learned = true)
    const learnedWords = allWords.filter(w => w.learned).length;
    
    // 未出題數 (尚未進入學習階段，即 learned = false)
    const unlearnedWords = totalWords - learnedWords;
    
    // 需複習單字數 (答對率 < 100% 且嘗試次數 > 0)
    const needReviewWords = allWords.filter(w => {
        const correct = w.correctCount || 0;
        const total = w.totalAttempts || 0;
        return w.learned && total > 0 && correct < total;
    }).length;

    const statsContainer = document.getElementById('statistics-container');
    
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div title="已完成學習/考試流程的單字數量">
                📚 已出題單字： <span style="color: #007bff; font-weight: bold;">${learnedWords}</span> / ${totalWords}
            </div>
            <div title="尚未進入學習流程的單字數量">
                🆕 剩餘單字： <span style="color: #28a745; font-weight: bold;">${unlearnedWords}</span>
            </div>
            <div title="需要額外複習，答對率非 100% 的單字數量">
                🚨 需加強複習： <span style="color: #ffc107; font-weight: bold;">${needReviewWords}</span>
            </div>
        `;
    }
}

/**
 * ⭐️ NEW: 計算一塊地上的所有單字的平均正確率。
 * @param {Array<number>} wordIds - 地塊上種植的單字ID列表。
 * @returns {number} 平均正確率 (0.0 - 1.0)。
 */
function calculatePlotMastery(wordIds) {
    if (wordIds.length === 0) return false; // 空地塊不算熟練

    // 🏆 新邏輯：檢查每個單字
    const allMastered = wordIds.every(id => {
        const word = currentWordDB.find(w => w.id === id);
        if (!word) return false;

        const correct = word.correctCount || 0;
        const total = word.totalAttempts || 0;

        // 條件：
        // 1. 至少要嘗試過一次 (total > 0)
        // 2. 且正確率要 >= MASTERY_THRESHOLD (70%)
        if (total === 0) {
            // 如果還沒考過，則該單字不算熟練
            return false;
        }

        return (correct / total) >= MASTERY_THRESHOLD;
    });

    // 如果所有單字都滿足條件，則地塊熟練
    return allMastered;
}

/**
 * ⭐️ 全域畢業管理視窗 (新增自動勾選功能)
 */
function showGraduationManagementWindow() {
    const modal = document.getElementById('word-modal');
    const listContainer = document.getElementById('word-list-container');
    const titleElement = modal.querySelector('h2');
    
    modal.style.display = 'block';
    titleElement.textContent = "全域畢業單字管理 (已學習清單)";

    // 撈出所有已經出題過的單字 (type === 'WORD' 且 learned 為 true)
    const learnedWords = currentWordDB.filter(w => w.type === 'WORD' && w.learned);

    if (learnedWords.length === 0) {
        listContainer.innerHTML = "<p style='text-align:center; padding:20px;'>目前還沒有已學習的單字喔！</p>";
        return;
    }

    // 依照正確率排序
    learnedWords.sort((a, b) => {
        const rateA = a.totalAttempts > 0 ? a.correctCount / a.totalAttempts : 0;
        const rateB = b.totalAttempts > 0 ? b.correctCount / b.totalAttempts : 0;
        return rateB - rateA;
    });

    const listHtml = learnedWords.map(wordObj => {
        const correct = wordObj.correctCount || 0;
        const total = wordObj.totalAttempts || 0;
        const accuracy = total > 0 ? (correct / total * 100).toFixed(0) : '0';
        
        return `
            <div class="word-row" data-accuracy="${accuracy}" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #eee; background: ${accuracy >= 80 ? '#f0fff4' : 'white'};">
                <input type="checkbox" class="global-mastery-checkbox" data-id="${wordObj.id}" data-acc="${accuracy}" style="width: 20px; height: 20px; margin-right: 15px; cursor: pointer;">
                <div style="flex-grow: 1;">
                    <strong style="font-size: 1.1em; color: #007bff;">${wordObj.word}</strong> 
                    <span style="color: #666; margin-left: 10px;">${wordObj.meaning}</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-weight: bold; color: ${accuracy >= 70 ? '#28a745' : '#dc3545'};">${accuracy}%</span>
                    <div style="font-size: 0.7em; color: #999;">正確/嘗試: ${correct}/${total}</div>
                </div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = `
        <div style="padding: 10px; background: #fff3cd; color: #856404; font-size: 0.9em; margin-bottom: 10px; border-radius: 5px;">
            勾選你已經背熟的單字。點擊按鈕後，這些單字將被移至 Excel 第三欄並下載新檔案。
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <button id="select-100-btn" style="flex: 1; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">
                ✅ 勾選 100% 正確
            </button>
            <button id="select-all-btn" style="flex: 1; padding: 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">
                ☑️ 全選所有
            </button>
            <button id="deselect-all-btn" style="flex: 1; padding: 8px; background: #eee; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 0.9em;">
                重置
            </button>
        </div>

        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px;">
            ${listHtml}
        </div>

        <button id="global-export-btn" style="
            display: block; width: 100%; margin-top: 20px; padding: 15px; 
            background-color: #6f42c1; color: white; border: none; 
            border-radius: 5px; cursor: pointer; font-size: 1.1em; font-weight: bold;"
        >
            🎓 確認畢業勾選單字並下載 CSV
        </button>
    `;

    // --- 事件綁定 ---

    // 1. 快捷勾選：100% 正確
    document.getElementById('select-100-btn').onclick = () => {
        const checkboxes = document.querySelectorAll('.global-mastery-checkbox');
        checkboxes.forEach(cb => {
            const acc = parseInt(cb.getAttribute('data-acc'));
            cb.checked = (acc === 100);
        });
    };

    // 2. 快捷勾選：全選
    document.getElementById('select-all-btn').onclick = () => {
        const checkboxes = document.querySelectorAll('.global-mastery-checkbox');
        checkboxes.forEach(cb => cb.checked = true);
    };

    // 3. 快捷勾選：重置
    document.getElementById('deselect-all-btn').onclick = () => {
        const checkboxes = document.querySelectorAll('.global-mastery-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
    };

    // 4. 下載匯出
    document.getElementById('global-export-btn').onclick = () => {
        const checkboxes = document.querySelectorAll('.global-mastery-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => parseInt(cb.getAttribute('data-id')));
        
        if (ids.length === 0) {
            alert("請先勾選單字！");
            return;
        }

        exportMasteredWordsToCSV(ids, currentWordDB);
    };
}

// -------------------------------------------------------------
// !! 單字學習/考試 核心 UI 控制函數 !!
// -------------------------------------------------------------

/**
 * 顯示學習頁面 (將考試入口指向多選題)
 * @param {Array<object>} words - 要學習的單字物件列表。
 */
function renderLearningPage(words) {
    const listContainer = document.getElementById('word-list-container');
    const titleElement = document.getElementById('word-modal').querySelector('h2');
    
    titleElement.textContent = "新單字學習 (New Words)";

    // 顯示單字列表
    const listHtml = words.map(wordObj => {
        // 處理單字中的單引號，避免 HTML onclick 崩潰
        const safeWord = wordObj.word.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        return `
            <div style="
                display: flex; 
                margin-bottom: 10px; 
                border-bottom: 1px dashed #ccc; 
                padding-bottom: 5px;
                align-items: center; /* 垂直居中對齊 */
            ">
                <strong style="
                    font-size: 1.1em; 
                    color: #007bff; 
                    width: 150px; /* <--- 英文單字寬度，您可以根據單字最長長度調整 */
                    display: inline-block;
                ">${wordObj.word}</strong> 
            
                <button onclick="speakWord('${safeWord}')" style="
                    background-color: #f0f7ff;
                    border: 1px solid #007bff;
                    color: #007bff;
                    border-radius: 50%; /* 圓形按鈕比較美觀 */
                    cursor: pointer;
                    margin-right: 15px;
                    width: 32px;
                    height: 32px;
                    flex-shrink: 0; /* 防止按鈕被擠壓 */
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2px 8px;
                    font-size: 1em;
                ">🔊</button> 
            
                <span style="color: #6c757d;">${wordObj.meaning}</span>
            </div>
        `;
    }).join('');

    // 2. 組合內容：清單 + 顯眼的綠色按鈕
    listContainer.innerHTML = `
        <div style="max-height: 400px; overflow-y: auto; margin-bottom: 20px;">
            ${listHtml}
        </div>
        
        <button id="start-exam-btn" style="
            display: block; 
            width: 100%; 
            padding: 15px; 
            font-size: 1.2em; 
            font-weight: bold;
            cursor: pointer; 
            background-color: #28a745; 
            color: white; 
            border: none; 
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.1s;
        ">
            下一頁，開始考試 (Start Exam)
        </button>
    `;

    // 綁定事件
    document.getElementById('start-exam-btn').onclick = () => {
        renderMultipleChoiceExam(words, 'Learning'); 
    };
    
    // 增加一點點按下去的反饋效果
    const btn = document.getElementById('start-exam-btn');
    btn.onmousedown = () => btn.style.transform = "scale(0.98)";
    btn.onmouseup = () => btn.style.transform = "scale(1)";
}

/**
 * 顯示複習頁面
 * @param {Array<object>} words - 要複習的單字物件列表。
 */
function renderReviewPage(words) {
    const listContainer = document.getElementById('word-list-container');
    const titleElement = document.getElementById('word-modal').querySelector('h2');
    titleElement.textContent = "單字複習 (Review Page)";

    // 篩選出需要測驗的單字 (排除 100% 正確的)
    const wordsForExam = words.filter(wordObj => {
        const correct = wordObj.correctCount || 0;
        const total = wordObj.totalAttempts || 0;
        return total === 0 || correct !== total;
    });

    // 顯示單字列表和答對率
    const listHtml = words.map(wordObj => {
        // 處理單字中的單引號，避免 HTML onclick 崩潰
        const safeWord = wordObj.word.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        const correct = wordObj.correctCount || 0;
        const total = wordObj.totalAttempts || 0;
        const accuracy = total > 0 ? (correct / total * 100).toFixed(0) : '0';
        
        const isProblemWord = total > 0 && parseFloat(accuracy) < 70;
        const isPerfectWord = total > 0 && parseFloat(accuracy) === 100;

        let style = '';
        let tag = '';
        if (isProblemWord) {
             style = 'border-left: 5px solid #ffc107; padding-left: 5px;';
             tag = ' ⚠️ (需加強)';
        } else if (isPerfectWord) {
             style = 'border-left: 5px solid #28a745; padding-left: 5px; opacity: 0.7;';
             tag = ' 👍 (已掌握)';
        }

        return `
            <div style="
                display: flex;
                justify-content: space-between; /* 讓答對率靠右 */
                align-items: center; 
                margin-bottom: 10px; 
                border-bottom: 1px dashed #ccc; 
                padding-bottom: 5px; 
                ${style}
            ">
                <div style="display: flex; align-items: center;">
                    <strong style="
                        font-size: 1.1em; 
                        color: #007bff; 
                        width: 150px; /* <--- 關鍵！確保中文從固定位置開始 */
                        display: inline-block; 
                    ">${wordObj.word}</strong> 
                    
                    <button onclick="speakWord('${safeWord}')" style="
                        background-color: #f0f7ff;
                        border: 1px solid #007bff;
                        color: #007bff;
                        border-radius: 50%; /* 圓形按鈕比較美觀 */
                        cursor: pointer;
                        margin-right: 15px;
                        width: 32px;
                        height: 32px;
                        flex-shrink: 0; /* 防止按鈕被擠壓 */
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1em;
                    ">🔊</button>
                    
                    <span style="color: #6c757d;">${wordObj.meaning}</span>
                </div>
                
                <span style="font-weight: bold; color: ${isProblemWord ? '#dc3545' : '#28a745'};">
                    ${accuracy}% (${correct}/${total})${tag}
                </span>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = listHtml;
    
    // 根據是否需要測驗來顯示按鈕或完成訊息
    let finalContent = `
        <div style="max-height: 400px; overflow-y: auto; margin-bottom: 20px;">
            ${listHtml}
        </div>
    `;

    if (wordsForExam.length > 0) {
        finalContent += `
            <button id="start-review-exam-btn" style="
                display: block; 
                width: 100%; 
                padding: 15px; 
                font-size: 1.2em; 
                font-weight: bold;
                cursor: pointer; 
                background-color: #ffc107; 
                color: #333; 
                border: none; 
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            ">
                開始複習測驗 (測驗 ${wordsForExam.length} 個單字)
            </button>
        `;
    } else {
        finalContent += `
            <div style="text-align: center; margin: 20px 0; color: #28a745; font-weight: bold; font-size: 1.1em;">
                🎉 太棒了！此區域單字已全部掌握。
            </div>
            <button onclick="document.getElementById('word-modal').style.display = 'none';" style="
                display: block; width: 100%; padding: 12px; background-color: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer;
            ">關閉</button>
        `;
    }

    listContainer.innerHTML = finalContent;

    // 綁定測驗按鈕事件
    const reviewBtn = document.getElementById('start-review-exam-btn');
    if (reviewBtn) {
        reviewBtn.onclick = () => renderMultipleChoiceExam(wordsForExam, 'Review');
    }
}


/**
 * ⭐️ NEW: 第一頁：多選題 (選中文意思)
 * @param {Array<object>} words - 要考試的單字物件列表。
 * @param {string} mode - 'Learning' 或 'Review' (用於決定下一步是填空題還是結束)。
 */
function renderMultipleChoiceExam(words, mode) {
const listContainer = document.getElementById('word-list-container');
    const titleElement = document.getElementById('word-modal').querySelector('h2');
    
    titleElement.textContent = `測驗 I: 選出中文 (共 ${words.length} 題)`;

    const allMeanings = currentWordDB.filter(w => w.type === 'WORD').map(w => w.meaning);
    
    const examHtml = words.map((wordObj, index) => {
        let options = [{ meaning: wordObj.meaning, isCorrect: true }];
        const distractors = shuffleArray(allMeanings.filter(m => m !== wordObj.meaning))
            .slice(0, 3)
            .map(m => ({ meaning: m, isCorrect: false }));
        options = shuffleArray(options.concat(distractors));

        const optionsHtml = options.map((opt, optIndex) => {
            const inputId = `q${wordObj.id}-opt${optIndex}`;
            return `
                <div style="margin-left: 20px;">
                    <input type="radio" 
                           id="${inputId}"
                           name="question-${wordObj.id}" 
                           value="${optIndex}" 
                           data-meaning="${opt.meaning}"
                           required>
                    <label for="${inputId}" style="cursor: pointer;">
                        ${opt.meaning}
                    </label>
                </div>
            `;
        }).join('');

        return `
            <div class="exam-question" data-word-id="${wordObj.id}" data-correct-answer="${wordObj.meaning}" style="margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                <p><strong>${index + 1}. ${wordObj.word}</strong> (請選出正確的中文意思):</p>
                ${optionsHtml}
            </div>
        `;
    }).join('');

    listContainer.innerHTML = `
        <form id="exam-form" data-exam-type="multiple-choice">
            ${examHtml}
            <button type="submit" style="
                display: block; 
                margin: 30px auto 10px; 
                padding: 10px 20px; 
                font-size: 1.2em; 
                cursor: pointer; 
                background-color: #007bff; 
                color: white; 
                border: none; 
                border-radius: 5px;"
            >
                下一頁：提交多選答案 (Next: Fill-in)
            </button>
        </form>
    `;

    // 綁定提交事件
    document.getElementById('exam-form').onsubmit = (e) => {
        e.preventDefault();
        
        // 提交多選題後，進入填空題
        const correctIds = submitMultipleChoice(words);
        
        // 只有在學習模式下才需要進行第二頁填空題
        if (mode === 'Learning') {
            // 確保所有單字都進入下一輪填空題，不論多選是否答對
            renderFillInTheBlankExam(words);
        } else {
            // 複習模式下，多選題結束即顯示最終結果
            // 注意：這裡我們暫時只顯示多選題的結果，如果要顯示總結果需要重構 submitExam
            // 為了簡潔，我們將在 submitFillInTheBlank 中統一顯示最終結果。
             // 讓 Review 模式也運行到 submitFillInTheBlank
             renderFillInTheBlankExam(words);
        }
    };
}


/**
 * ⭐️ NEW: 第二頁：填空題 (填寫英文單字)
 * @param {Array<object>} words - 要考試的單字物件列表。
 */
function renderFillInTheBlankExam(words) {
    const listContainer = document.getElementById('word-list-container');
    const titleElement = document.getElementById('word-modal').querySelector('h2');

    titleElement.textContent = `測驗 II: 英文單字填空 (共 ${words.length} 題)`;

const examHtml = words.map((wordObj, index) => {
        return `
            <div class="exam-question" data-word-id="${wordObj.id}" style="margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                <p><strong>${index + 1}. ${wordObj.meaning}</strong> (請寫出英文單字):</p>
                <input type="text" 
                       name="question-${wordObj.id}" 
                       data-correct-answer="${wordObj.word}"
                       autocomplete="off" // ⭐️ 關鍵修正：禁用瀏覽器自動填充
                       spellcheck="false"  // ⭐️ 關鍵修正：防止紅字底線干擾
                       style="width: 80%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                       required>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = `
        <form id="exam-form" data-exam-type="fill-in-the-blank">
            ${examHtml}
            <button type="submit" style="
                display: block; 
                width: 100%;
                margin: 30px auto 10px; 
                padding: 15px; 
                font-size: 1.2em; 
                cursor: pointer; 
                background-color: #dc3545; 
                color: white; 
                border: none; 
                border-radius: 8px;
                font-weight: bold;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            ">
                提交所有答案並完成 (Submit All)
            </button>
        </form>
    `;

    // 綁定提交事件
    document.getElementById('exam-form').onsubmit = (e) => {
        e.preventDefault();
        submitFillInTheBlank(words); // 提交填空題並顯示最終結果
    };
}

/**
 * ⭐️ NEW: 專門處理多選題的提交，但不顯示結果，僅用於過渡。
 * @param {Array<object>} words - 剛才考試的單字物件列表。
 * @returns {Array<number>} 答對的單字ID列表 (雖然目前沒用到，但保留結構)
 */
function submitMultipleChoice(words) {
    const form = document.getElementById('exam-form');
    let correctIds = []; // 這個變數現在用途不大，但可保留
    multipleChoiceResults = {}; // 重置結果

    words.forEach(wordObj => {
        const questionElement = form.querySelector(`.exam-question[data-word-id="${wordObj.id}"]`);
        const selectedOption = questionElement ? questionElement.querySelector(`input[name="question-${wordObj.id}"]:checked`) : null;
        
        let isCorrect = false;

        if (selectedOption) {
            const submittedMeaning = selectedOption.getAttribute('data-meaning');
            isCorrect = (submittedMeaning === wordObj.meaning);
        }

        // 儲存多選題結果
        multipleChoiceResults[wordObj.id] = isCorrect;

    });
    
    return correctIds;
}

/**
 * ⭐️ NEW: 處理填空題的提交，並統一更新數據庫和顯示最終結果。
 * @param {Array<object>} words - 剛才考試的單字物件列表。
 */
function submitFillInTheBlank(words) {
    const form = document.getElementById('exam-form');
    let totalPerfectScore = 0; // 統計完美答對的單字數量
    const results = [];
    
    words.forEach(wordObj => {
        const questionElement = form.querySelector(`.exam-question[data-word-id="${wordObj.id}"]`);
        const inputField = questionElement ? questionElement.querySelector(`input[name="question-${wordObj.id}"]`) : null;

        // 🛠 修正比對邏輯：
        // .trim() 去除使用者不小心輸入的頭尾空白
        // .replace(/\s+/g, ' ') 將片語中間可能連打的兩個空白縮減為一個
        const submittedAnswer = inputField ? inputField.value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
        const correctAnswer = wordObj.word.trim().toLowerCase().replace(/\s+/g, ' ');
        
        // 1. 取得兩種題型的結果
        let isFillInCorrect = (submittedAnswer === correctAnswer); // 填空題結果
        const isMultipleChoiceCorrect = multipleChoiceResults[wordObj.id] === true; // 多選題結果
        
        // 2. 🏆 核心邏輯：必須兩種都對才算「完美答對」
        const isPerfectlyCorrect = isFillInCorrect && isMultipleChoiceCorrect;
        
        if (isPerfectlyCorrect) {
            totalPerfectScore++;
        }

        // 3. ⭐️ 統一計分：只加 1 次嘗試次數，答對時才加 1 次正確次數
        const globalWord = currentWordDB.find(w => w.id === wordObj.id);
        if (globalWord) {
            globalWord.totalAttempts = (globalWord.totalAttempts || 0) + 1;
            if (isPerfectlyCorrect) { // 只有完美答對才算正確
                globalWord.correctCount = (globalWord.correctCount || 0) + 1;
            }
        }
        
        results.push({ 
            word: wordObj.word, 
            meaning: wordObj.meaning, 
            isFillInCorrect: isFillInCorrect,
            isMultipleChoiceCorrect: isMultipleChoiceCorrect,
            isPerfectlyCorrect: isPerfectlyCorrect, // 用於結果顯示
            submitted: submittedAnswer
        });
    });

    // 4. 存檔
    saveGameData(currentWordDB, currentFarmState);

    // 5. 顯示最終結果 (顯示兩種結果)
    const listContainer = document.getElementById('word-list-container');
    const titleElement = document.getElementById('word-modal').querySelector('h2');

    titleElement.textContent = `最終測驗結果: 總完美答對 ${totalPerfectScore} / ${words.length}`;
    
    const resultHtml = results.map(res => {
        const color = res.isPerfectlyCorrect ? '#28a745' : '#dc3545';
        const statusIcon = res.isPerfectlyCorrect ? '🏆 完美!' : '❌ 需加強';
        
        // 顯示兩種題型的詳細結果
        const mcStatus = res.isMultipleChoiceCorrect ? '✅' : '❌';
        const fiStatus = res.isFillInCorrect ? '✅' : '❌';
        const submittedText = res.isFillInCorrect ? '' : ` (你寫: ${res.submitted})`;
        
        return `
            <div style="color: ${color}; margin-bottom: 5px; padding: 5px; border-left: 3px solid ${color};">
                <strong>${res.word}</strong>: ${res.meaning} 
                <span style="font-weight: bold;">${statusIcon}</span>
                <br>
                <small style="margin-left: 10px; color: #6c757d;">
                    多選題: ${mcStatus} | 填空題: ${fiStatus}${submittedText}
                </small>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = `
        <div style="margin-bottom: 20px; font-size: 1.1em; text-align: center;">
            您這次考試的總體表現：**${totalPerfectScore} / ${words.length}** (兩種題型皆答對的數量)
        </div>
        ${resultHtml}
        <button onclick="finalExamFinish();" style=" 
            display: block; 
            margin: 20px auto 10px; 
            padding: 10px 20px; 
            font-size: 1.2em; 
            cursor: pointer; 
            background-color: #6c757d; 
            color: white; 
            border: none; 
            border-radius: 5px;"
        >
            完成
        </button>
    `;
}

// -------------------------------------------------------------
// !! 新增：結束考試的處理函數 !!
// -------------------------------------------------------------

function finalExamFinish() {
    // 關閉 Modal
    document.getElementById('word-modal').style.display = 'none';
    
    // ⭐️ 清除追蹤狀態，防止 Modal 關閉時觸發重設
    currentPlotIndex = -1; 
    currentExamWordIds = [];
}

// -------------------------------------------------------------
// !! 遊戲主體入口函數 !!
// -------------------------------------------------------------

function showWordLearningWindow(wordIds, plotIndex) { // ⭐️ 新增參數 plotIndex
    const wordsToLearn = wordIds
        .map(id => currentWordDB.find(w => w.id === id))
        .filter(w => w && w.type === 'WORD'); // 確保只抓取 WORD 類型

    // 檢查是否有單字
    if (wordsToLearn.length === 0) {
        document.getElementById('word-list-container').innerHTML = 
            "<p style='text-align:center; padding:20px;'>此地塊的單字資料已過期或已被移除，請重新整理網頁。</p>";
        return;
    }
    
    // ⭐️ 儲存當前考試狀態
    currentPlotIndex = plotIndex;
    currentExamWordIds = wordIds;
    
    document.getElementById('word-modal').style.display = 'block';
    renderLearningPage(wordsToLearn);
}

// 複習模式下不處理退出重置，因為複習不會改變地塊狀態，所以不需要 plotIndex
function showWordReviewWindow(wordIds) { 
    const wordsToReview = wordIds
        .map(id => currentWordDB.find(w => w.id === id))
        .filter(w => w && w.type === 'WORD');

    if (wordsToReview.length === 0) {
        document.getElementById('word-list-container').innerHTML = 
            "<p style='text-align:center; padding:20px;'>找不到複習單字（可能已被移至畢業區）。</p>";
        return;
    }

    // ⭐️ NEW: 複習模式下，將 plotIndex 設為 -1
    currentPlotIndex = -1; 
    currentExamWordIds = wordIds;

    document.getElementById('word-modal').style.display = 'block';
    renderReviewPage(wordsToReview);
}


// -------------------------------------------------------------
// Phaser 遊戲主體
// -------------------------------------------------------------

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 900,
    parent: 'game-container',
    debug: true, 
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    // ⭐️ 關鍵新增：Phaser 縮放配置 ⭐️
    scale: {
        mode: Phaser.Scale.FIT, // 讓遊戲畫面按比例縮放以適應容器
        autoCenter: Phaser.Scale.CENTER_BOTH, // 讓遊戲畫面在容器中水平和垂直居中
        parent: 'game-container' // 再次指定容器 ID
    }
};

const game = new Phaser.Game(config);

function preload ()
{
    this.load.image('bg_grass', 'assets/grass.png'); // 拼接小草皮
    this.load.image('dirt', 'assets/dirt.png');      // 格子用的泥巴地
    this.load.image('seedling', 'assets/seedling.png'); 
    this.load.image('tree', 'assets/tree.png');
}

async function create () 
{
    // 定義基礎數值
    const GRID_ROWS = 5;
    const GRID_COLS = 5;
    const CELL_SIZE = 150;
    const START_X = 25;
    const START_Y = 60;

    // 背景拼接
    // 使用 tileSprite(x, y, width, height, key)
    // Origin(0,0) 表示從左上角開始鋪，鋪滿整個 800x900 的畫布
    const bg = this.add.tileSprite(0, 0, 800, 900, 'bg_grass').setOrigin(0, 0);
    
    // 整拼接圖的縮放比例
    // 如果圖片太大，請嘗試 0.01 或 0.05；如果太小，請嘗試 0.5 或 1.0
    // 例如 0.5 代表將原圖壓縮成 50% 的大小後再進行拼接
    bg.setTileScale(0.1, 0.1);

    // 3. 載入資料
    const { wordDB, farmState } = await loadGameData();
    currentWordDB = wordDB;
    currentFarmState = farmState;
    updateStatisticsDisplay();

    // 4. 初始化網格
    this.farmPlots = []; 
    const graphics = this.add.graphics({ lineStyle: { width: 2, color: 0x654321, alpha: 0.3 } });

    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const plotIndex = row * GRID_COLS + col;
            
            // 資料防禦
            const defaultState = { isPlanted: false, wordIds: [], plantDate: null };
            while (currentFarmState.length <= plotIndex) {
                currentFarmState.push(JSON.parse(JSON.stringify(defaultState)));
            }
            const plotState = currentFarmState[plotIndex]; 

            const x = START_X + col * CELL_SIZE + (CELL_SIZE / 2);
            const y = START_Y + row * CELL_SIZE + (CELL_SIZE / 2);

            // 決定紋理：空地一律用 'dirt'
            let textureKey = 'dirt';
            if (plotState.isPlanted) {
                const isMastered = calculatePlotMastery(plotState.wordIds); 
                textureKey = isMastered ? 'tree' : 'seedling';
            }

            // 放置地塊 (泥巴地/種子/樹)
            const plot = this.add.image(x, y, textureKey);
            plot.displayWidth = CELL_SIZE;
            plot.displayHeight = CELL_SIZE;
            plot.isPlanted = plotState.isPlanted; 
            plot.wordIds = plotState.wordIds || [];
            plot.customRow = row; 
            plot.customCol = col; 
            plot.customIndex = plotIndex; 
            plot.isMastered = (textureKey === 'tree');
            this.farmPlots.push(plot);
        }
    }

    // ------------------------------------------------
    // ⭐️ 清除按鈕
    // ------------------------------------------------
    const clearButton = this.add.text(
        115, 
        20, 
        '⚡️ 清除遊戲進度 ⚡️', 
        { 
            fontSize: '20px', 
            fill: '#ff4444', 
            backgroundColor: '#330000',
            padding: { x: 10, y: 5 }
        }
    )
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true }) // 加上小手指標
    .on('pointerdown', () => {
        // 核心防禦：如果表單開著，不准點擊
        const modal = document.getElementById('word-modal');
        if (modal && modal.style.display !== 'none' && modal.style.display !== '') return;
        
        clearGameData();
    });
    
    // ------------------------------------------------
    // ⭐️ 畢業管理按鈕
    // ------------------------------------------------
    const manageButton = this.add.text(
        650, // 放置在右上方
        20, 
        '🎓 畢業單字管理', 
        { 
            fontSize: '20px', 
            fill: '#ffffff', 
            backgroundColor: '#6f42c1', // 紫色按鈕
            padding: { x: 10, y: 5 }
        }
    )
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
        // 核心防禦：如果表單開著，不准重複開啟
        const modal = document.getElementById('word-modal');
        if (modal && modal.style.display === 'block') return;
        
        // 💡 開啟前先禁用遊戲輸入
        setGameInputActive(false);
        showGraduationManagementWindow();
    });
    
    // ------------------------------------------------
    // ⭐️ 修正單字彈窗的 X 關閉按鈕 ⭐️
    // ------------------------------------------------
    const modal = document.getElementById('word-modal');
    const closeButton = document.getElementById('modal-close');
    
	// 建立一個輔助函數來控制遊戲輸入
    const setGameInputActive = (active) => {
        // 控制清除與畢業按鈕的互動
        clearButton.setInteractive();   // 恢復可點擊
        manageButton.setInteractive();  // 恢復可點擊
        this.input.enabled = true;      // 恢復地塊偵測
    };
	
    if (modal && closeButton) {
        const resetPlotOnExit = () => { // ⭐️ 提取重設邏輯
            modal.style.display = 'none';
            setGameInputActive(true); // ⭐️ 關閉彈窗，恢復遊戲點擊
            
            // 只有在「學習」模式下，且中途退出時才重設地塊
            if (currentPlotIndex !== -1) {
                const plot = this.farmPlots[currentPlotIndex];
                if (plot && plot.isPlanted && plot.texture.key === 'seedling') {
                    
                    // 1. 重設地塊視覺
                    plot.setTexture('dirt');
                    plot.isPlanted = false;
                    plot.wordIds = [];

                    // 2. 重設單字狀態 (取消標記為已學習)
                    currentExamWordIds.forEach(id => {
                        const word = currentWordDB.find(w => w.id === id);
                        if (word) word.learned = false;
                    });

                    // 3. 重設農場狀態資料
                    currentFarmState[currentPlotIndex] = { isPlanted: false, wordIds: [], plantDate: null };
                    saveGameData(currentWordDB, currentFarmState); 
                    
                    console.log(`地塊 ${currentPlotIndex} 學習/考試被中途退出，已重設為草地。`);
                }
                
                // 重設追蹤變數
                currentPlotIndex = -1;
                currentExamWordIds = [];
            }
        }
        closeButton.onclick = resetPlotOnExit; // 關閉按鈕使用重設邏輯
        
    } else {
        console.warn("警告：未找到 #word-modal 或 #modal-close 元素。請確認 index.html 檔案是否正確。");
    }


    // ------------------------------------------------
    // ⚡️ 全域點擊偵測（使用純數學判斷）
    // ------------------------------------------------
    
    const testText = this.add.text(400, 30, '點擊測試: 無', { fontSize: '24px', fill: '#fff' }).setOrigin(0.5);
    
    this.input.on('pointerdown', (pointer) => {
        
        // 核心防禦：如果 Modal 正在顯示，則不處理點擊事件，我們保留這行作為雙重保險
        if (modal && modal.style.display === 'block') return;

		// 檢查是否點到按鈕，避免點按鈕時觸發地塊種植
        // 在 Phaser 裡 pointerover 是更準確的判斷，這裡用簡易判斷：
        if (pointer.y < 60) return; 

        let plotClicked = null;
        let clickedIndex = -1;

        for (let i = 0; i < this.farmPlots.length; i++) {
            const plot = this.farmPlots[i];
            
            const col = plot.customCol;
            const row = plot.customRow;
            
            const xMin = START_X + col * CELL_SIZE;
            const xMax = START_X + (col + 1) * CELL_SIZE;
            const yMin = START_Y + row * CELL_SIZE;
            const yMax = START_Y + (row + 1) * CELL_SIZE;
            
            if (pointer.x >= xMin && pointer.x <= xMax && pointer.y >= yMin && pointer.y <= yMax) {
                plotClicked = plot;
                clickedIndex = plot.customIndex;
                break;
            }
        }

        if (plotClicked) {
        	// ⭐️ 開啟視窗前，禁用遊戲輸入
            setGameInputActive(false);
            
            if (!plotClicked.isPlanted) {
                // ⭐️ 種植邏輯

                // 🏆 關鍵修正 A: 檢查是否有未學習單字
                const unlearnedWordsCount = currentWordDB.filter(w => !w.learned).length;
                if (unlearnedWordsCount === 0) {
                    alert("你沒有種子單字了！請匯入新的單字清單或等待下一批單字。");
                    updateStatisticsDisplay(); // 確保統計數據是最新的
                    setGameInputActive(true); // 彈窗失敗要復原輸入
                    return; // 提前退出，不進行種植
                }

                const newWordIds = getTenUnlearnedWords(currentWordDB);
                
                // 🏆 關鍵修正 B: 再次檢查，如果單字數量不足 10 個，也給予提示並退出。
                if (newWordIds.length === 0) {
                    alert("你沒有種子單字了！請匯入新的單字清單或等待下一批單字。");
                    updateStatisticsDisplay();
                    setGameInputActive(true); // 彈窗失敗要復原輸入
                    return; // 提前退出
                }
                
                // 狀態更新與存檔...
                // 注意：在成功完成考試前，我們只改變 Phaser 物件的 isPlanted
                // 暫時不將 isPlanted 寫入 currentFarmState 和 currentWordDB.learned
                
                plotClicked.setTexture('seedling');
                plotClicked.isPlanted = true; 
                plotClicked.wordIds = newWordIds; 
                
                // ⭐️ 將狀態寫入數據庫，但如果退出會被 resetPlotOnExit 清除。
                newWordIds.forEach(id => {
                    const word = currentWordDB.find(w => w.id === id);
                    if (word) word.learned = true; // 先標記為已學習
                });
                currentFarmState[clickedIndex].isPlanted = true; // 先標記已種植
                currentFarmState[clickedIndex].wordIds = newWordIds;
                currentFarmState[clickedIndex].plantDate = new Date().toISOString();
                saveGameData(currentWordDB, currentFarmState); // 儲存暫時狀態
                
                // 6. 呼叫單字學習視窗 (觸發學習 -> 考試流程)
                showWordLearningWindow(newWordIds, plotClicked.customIndex); // ⭐️ 傳遞 plotIndex
                
            } else {
                // ⭐️ 複習邏輯 (已種植)
                showWordReviewWindow(plotClicked.wordIds);
            }
        }
    });
}

function update ()
{
    // ⭐️ NEW: 實時監控地塊熟練度
    if (this.farmPlots && currentWordDB) {
        this.farmPlots.forEach(plot => {
            // 只處理已種植且尚未熟練的地塊
            if (plot.isPlanted && !plot.isMastered) {
                // 🏆 MODIFIED: 直接呼叫檢查函數
                const isMastered = calculatePlotMastery(plot.wordIds);
                
                if (isMastered) { // 🏆 檢查是否為 true
                    // 達到熟練度，更新圖片和狀態
                    plot.setTexture('tree');
                    plot.isMastered = true;
                    
                    // console.log(`地塊 ${plot.customIndex} 已熟練成樹！`);
                }
            }
        });
    }

}
