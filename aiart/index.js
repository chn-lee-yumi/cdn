// https://www.lddgo.net/encrypt/js
// {
//     "compact": true,
//     "config": "",
//     "controlFlowFlattening": false,
//     "controlFlowFlatteningThreshold": 0.75,
//     "deadCodeInjection": false,
//     "deadCodeInjectionThreshold": 0.4,
//     "debugProtection": true,
//     "debugProtectionInterval": 500,
//     "disableConsoleOutput": true,
//     "domainLock": ["aiart.gcc.ac.cn"],
//     "domainLockRedirectUrl": "https://aiart.gcc.ac.cn/",
//     "exclude": [],
//     "forceTransformStrings": [],
//     "identifierNamesCache": null,
//     "identifierNamesGenerator": "hexadecimal",
//     "identifiersPrefix": "",
//     "identifiersDictionary": [],
//     "ignoreImports": false,
//     "inputFileName": "",
//     "log": false,
//     "numbersToExpressions": false,
//     "optionsPreset": "default",
//     "renameGlobals": false,
//     "renameProperties": false,
//     "renamePropertiesMode": "safe",
//     "reservedNames": [],
//     "reservedStrings": [],
//     "stringArrayRotate": true,
//     "seed": 0,
//     "selfDefending": false,
//     "stringArrayShuffle": true,
//     "simplify": true,
//     "sourceMap": false,
//     "sourceMapBaseUrl": "",
//     "sourceMapFileName": "",
//     "sourceMapMode": "separate",
//     "sourceMapSourcesMode": "sources-content",
//     "splitStrings": false,
//     "splitStringsChunkLength": 10,
//     "stringArray": true,
//     "stringArrayCallsTransform": false,
//     "stringArrayCallsTransformThreshold": 0.5,
//     "stringArrayEncoding": [
//         "none"
//     ],
//     "stringArrayIndexesType": [
//         "hexadecimal-number"
//     ],
//     "stringArrayIndexShift": true,
//     "stringArrayWrappersChainedCalls": true,
//     "stringArrayWrappersCount": 1,
//     "stringArrayWrappersParametersMaxCount": 2,
//     "stringArrayWrappersType": "variable",
//     "stringArrayThreshold": 0.75,
//     "target": "browser",
//     "transformObjectKeys": false,
//     "unicodeEscapeSequence": true
// }

let statusCheckIntervals = {};
const STORAGE_KEY = 'generation_history';
const MAX_HISTORY_ITEMS = 60;

// 保存历史记录到localStorage
function saveHistory(taskId, prompt, status) {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const existingIndex = history.findIndex(item => item.taskId === taskId);
    
    if (existingIndex !== -1) {
        // 更新现有记录
        history[existingIndex].status = status;
        history[existingIndex].prompt = prompt;
        // 将更新后的记录移到最前面
        const updatedItem = history.splice(existingIndex, 1)[0];
        history.unshift(updatedItem);
    } else {
        // 添加新记录到最前面
        history.unshift({ taskId, prompt, status });
    }
    
    // 只保留最近60条记录
    if (history.length > MAX_HISTORY_ITEMS) {
        history.pop();
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// 创建任务项
function createTaskItem(taskId, status, prompt) {
    const tasksContainer = document.getElementById('tasksContainer');
    const taskItem = document.createElement('div');
    taskItem.className = 'task-item';
    taskItem.id = `task-${taskId}`;
    
    // 根据状态设置颜色类
    let statusClass = 'bg-primary';
    switch (status) {
        case '已完成':
            statusClass = 'bg-success';
            break;
        case '生成中':
            statusClass = 'bg-warning';
            break;
        case '等待中':
            statusClass = 'bg-primary';
            break;
        case '失败':
            statusClass = 'bg-danger';
            break;
    }
    
    taskItem.innerHTML = `
        <div class="task-prompt">${prompt}</div>
        <div class="d-flex align-items-center justify-content-between">
            <div>
                <span id="status-${taskId}" class="status-badge ${statusClass}">${status}</span>
                <span id="queue-${taskId}" class="queue-badge ms-2" style="display: none;">队列中</span>
            </div>
            <a href="/task/${taskId}" class="task-link" target="_blank">
                查看结果
                <i class="bi bi-arrow-right"></i>
            </a>
        </div>
    `;
    
    // 将新任务插入到容器的最前面
    if (tasksContainer.firstChild) {
        tasksContainer.insertBefore(taskItem, tasksContainer.firstChild);
    } else {
        tasksContainer.appendChild(taskItem);
    }
}

// 从localStorage加载历史记录
function loadHistory() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const tasksContainer = document.getElementById('tasksContainer');
    tasksContainer.innerHTML = ''; // 清空现有内容
    
    let hasRunningTask = false;
    
    // 反转数组，使最新的记录显示在前面
    [...history].reverse().forEach(item => {
        // 创建任务项
        createTaskItem(item.taskId, item.status, item.prompt);
        
        // 检查是否有正在运行的任务
        if (item.status !== '已完成' && item.status !== '失败') {
            hasRunningTask = true;
            setTimeout(() => {
                checkStatus(item.taskId);
                statusCheckIntervals[item.taskId] = setInterval(() => checkStatus(item.taskId), 5000);
            }, 1500);
        }
    });
    
    // 如果有正在运行的任务，禁用生成按钮
    if (hasRunningTask) {
        document.getElementById('generateBtn').disabled = true;
    }
}

async function checkStatus(taskId) {
    try {
        const response = await fetch(`/status/image_generation/${taskId}`);
        const data = await response.json();
        
        // 如果状态没有变化，不更新UI
        const currentStatus = document.getElementById(`status-${taskId}`).textContent;
        if (currentStatus === data.status) {
            // 即使状态没变，如果是等待中状态，也要更新队列位置
            if (data.status === '等待中' && data.queue_position) {
                const queueBadge = document.getElementById(`queue-${taskId}`);
                if (queueBadge) {
                    queueBadge.textContent = `队列中 (第 ${data.queue_position} 位)`;
                    queueBadge.style.display = 'inline-block';
                }
            }
            return;
        }
        
        // 更新历史记录
        saveHistory(taskId, data.prompt, data.status);
        
        // 更新UI状态
        updateTaskStatus(taskId, data.status, data.prompt);
        
        // 如果任务已完成或失败，停止检查
        if (data.status === '已完成' || data.status === '失败') {
            clearInterval(statusCheckIntervals[taskId]);
            delete statusCheckIntervals[taskId];
            
            // 检查是否还有正在运行的任务
            const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            const hasRunningTask = history.some(item => 
                item.status === '等待中' || item.status === '生成中'
            );
            
            // 只有在没有运行中的任务时才启用生成按钮
            document.getElementById('generateBtn').disabled = hasRunningTask;
        }
        
        // 如果是等待中状态且有队列位置，显示队列信息
        if (data.status === '等待中' && data.queue_position) {
            const queueBadge = document.getElementById(`queue-${taskId}`);
            if (queueBadge) {
                queueBadge.textContent = `队列中 (第 ${data.queue_position} 位)`;
                queueBadge.style.display = 'inline-block';
            }
        }
    } catch (error) {
        console.error('检查状态失败：', error);
    }
}

// Custom Dropdown Logic
function setupCustomDropdown(headerId, listId, selectedTextId, defaultValue, defaultText) {
    const header = document.getElementById(headerId);
    const list = document.getElementById(listId);
    const selectedTextSpan = document.getElementById(selectedTextId);
    const selectedIconContainer = header.querySelector('.selected-value');
    let selectedValue = defaultValue;

    // Initialize display text and icon
    selectedTextSpan.textContent = defaultText;
    // Find the item with the default value and copy its icon
    const defaultItem = list.querySelector(`.dropdown-item[data-value='${defaultValue}']`);
    if (defaultItem) {
        const defaultItemIcon = defaultItem.querySelector('svg') || defaultItem.querySelector('i.bi');
        if (defaultItemIcon) {
            selectedIconContainer.innerHTML = defaultItemIcon.outerHTML + selectedTextSpan.outerHTML;
        }
    }

    header.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent closing other dropdowns
        // Close other dropdowns
        document.querySelectorAll('.custom-dropdown .dropdown-list').forEach(otherList => {
            if (otherList.id !== listId) {
                otherList.style.display = 'none';
                document.getElementById(otherList.id.replace('List','Header')).classList.remove('open');
            }
        });

        list.style.display = list.style.display === 'block' ? 'none' : 'block';
        header.classList.toggle('open');
    });

    list.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedValue = item.getAttribute('data-value');
            selectedTextSpan.textContent = item.textContent.trim();

            // Update the selected icon
            const itemIcon = item.querySelector('svg') || item.querySelector('i.bi');
            if (itemIcon) {
                selectedIconContainer.innerHTML = itemIcon.outerHTML + selectedTextSpan.outerHTML;
            }

            list.style.display = 'none';
            header.classList.remove('open');
        });
    });
    
    return { getSelectedValue: () => selectedValue };
}

// Setup each custom dropdown
const aspectRatioDropdown = setupCustomDropdown(
    'aspectRatioHeader',
    'aspectRatioList',
    'selectedAspectRatioText',
    'square',
    '方形比例'
);

const styleDropdown = setupCustomDropdown(
    'styleHeader',
    'styleList',
    'selectedStyleText',
    '',
    '无风格'
);

const colorDropdown = setupCustomDropdown(
    'colorHeader',
    'colorList',
    'selectedColorText',
    '',
    '默认'
);

const lightingDropdown = setupCustomDropdown(
    'lightingHeader',
    'lightingList',
    'selectedLightingText',
    '',
    '默认'
);

const compositionDropdown = setupCustomDropdown(
    'compositionHeader',
    'compositionList',
    'selectedCompositionText',
    '',
    '默认'
);

const resolutionDropdown = setupCustomDropdown(
    'resolutionHeader',
    'resolutionList',
    'selectedResolutionText',
    'standard',
    '标准分辨率'
);

// Close dropdowns when clicking outside any dropdown
document.addEventListener('click', (event) => {
    document.querySelectorAll('.custom-dropdown .dropdown-list').forEach(list => {
        const header = document.getElementById(list.id.replace('List','Header'));
        if (!header.contains(event.target) && !list.contains(event.target)) {
            list.style.display = 'none';
            header.classList.remove('open');
        }
    });
});

// 清空历史记录
document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('确定要清空所有历史记录吗？')) {
        localStorage.removeItem(STORAGE_KEY);
        const tasksContainer = document.getElementById('tasksContainer');
        tasksContainer.innerHTML = '';
        // 清除所有状态检查定时器
        Object.keys(statusCheckIntervals).forEach(taskId => {
            clearInterval(statusCheckIntervals[taskId]);
        });
        statusCheckIntervals = {};
    }
});

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    window.turnstileToken = null;
    window.turnstileLoaded = false;
});

// 更新任务状态UI
function updateTaskStatus(taskId, status, prompt) {
    const statusBadge = document.getElementById(`status-${taskId}`);
    const queueBadge = document.getElementById(`queue-${taskId}`);
    if (!statusBadge) return;
    
    statusBadge.textContent = status;
    
    // 更新状态样式
    statusBadge.className = 'status-badge';
    switch (status) {
        case '已完成':
            statusBadge.classList.add('bg-success');
            queueBadge.style.display = 'none';
            break;
        case '生成中':
            statusBadge.classList.add('bg-warning');
            queueBadge.style.display = 'none';
            break;
        case '处理中':
            statusBadge.classList.add('bg-warning');
            queueBadge.style.display = 'none';
            break;
        case '等待中':
            statusBadge.classList.add('bg-primary');
            queueBadge.style.display = 'none';
            break;
        case '失败':
            statusBadge.classList.add('bg-danger');
            queueBadge.style.display = 'none';
            break;
        default:
            statusBadge.classList.add('bg-primary');
            queueBadge.style.display = 'none';
    }
}

// 显示 Turnstile 浮窗
function showTurnstileModal() {
    document.getElementById('turnstileModal').classList.add('active');
    
    // 动态加载 Turnstile 脚本
    if (!window.turnstileLoaded) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            window.turnstile.render('#turnstile-widget', {
                sitekey: '0x4AAAAAABfjxJv77qWNSFrH',
                callback: onTurnstileSuccess,
                'refresh-expired': 'manual',
                'size': 'normal'
            });
        };
        document.head.appendChild(script);
        window.turnstileLoaded = true;
    } else {
        // 如果脚本已加载，直接重置
        if (window.turnstile) {
            window.turnstile.reset();
        }
    }
}

// 关闭 Turnstile 浮窗
function closeTurnstileModal() {
    document.getElementById('turnstileModal').classList.remove('active');
}

// Turnstile 回调函数
window.onTurnstileSuccess = function(token) {
    if (token) {
        window.turnstileToken = token;
        // 验证成功后自动关闭浮窗并开始生成
        closeTurnstileModal();
        startGeneration();
    }
};

// 开始生成流程
async function startGeneration() {
    // 检查是否有有效的验证 token
    if (!window.turnstileToken) {
        alert('请完成人机验证');
        showTurnstileModal();
        return;
    }

    const promptText = document.getElementById('prompt').value.trim();
    if (!promptText) {
        alert('请输入提示词');
        return;
    }

    // 禁用生成按钮
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.disabled = true;

    // Get selected values from custom dropdowns
    const aspectRatioValue = aspectRatioDropdown.getSelectedValue();
    const styleValue = styleDropdown.getSelectedValue();
    const colorValue = colorDropdown.getSelectedValue();
    const lightingValue = lightingDropdown.getSelectedValue();
    const compositionValue = compositionDropdown.getSelectedValue();
    const resolutionValue = resolutionDropdown.getSelectedValue();

    // Assemble the final prompt
    let finalPrompt = promptText;
    if (styleValue) finalPrompt += styleValue;
    if (colorValue) finalPrompt += colorValue;
    if (lightingValue) finalPrompt += lightingValue;
    if (compositionValue) finalPrompt += compositionValue;

    // 显示加载动画
    document.getElementById('loading').style.display = 'block';

    try {
        const response = await fetch('/generate/image_generation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `prompt=${encodeURIComponent(finalPrompt)}&aspect_ratio=${encodeURIComponent(aspectRatioValue)}&high_resolution=${resolutionValue === 'high'}&cf-turnstile-response=${encodeURIComponent(window.turnstileToken)}`
        });

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            alert('服务器返回了非JSON响应，请截图联系开发者：\n\n' + text);
            generateBtn.disabled = false;
            window.turnstileToken = null;
            return;
        }

        if (data.task_id) {
            // 保存到历史记录
            saveHistory(data.task_id, promptText, '等待中');
            // 创建新的任务项
            createTaskItem(data.task_id, '等待中', promptText);
            
            // 开始定期检查状态
            if (statusCheckIntervals[data.task_id]) {
                clearInterval(statusCheckIntervals[data.task_id]);
            }
            checkStatus(data.task_id);
            statusCheckIntervals[data.task_id] = setInterval(() => checkStatus(data.task_id), 5000);

            // 重置 Turnstile token
            window.turnstileToken = null;
        } else {
            alert('生成请求失败：' + (data.error || '未知错误'));
            generateBtn.disabled = false;  // 如果失败，重新启用按钮
            // 重置 Turnstile token
            window.turnstileToken = null;
        }
    } catch (error) {
        alert('请求失败：' + error.message);
        generateBtn.disabled = false;  // 如果出错，重新启用按钮
        // 重置 Turnstile token
        window.turnstileToken = null;
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

document.getElementById('generateBtn').addEventListener('click', () => {
    // 检查提示词是否为空
    const promptText = document.getElementById('prompt').value.trim();
    if (!promptText) {
        alert('请输入提示词');
        return;
    }
    // 进行人机验证
    showTurnstileModal();
});

// 检测广告是否被屏蔽
function checkAdBlocker() {
    let isAdBlocked = false;
    // 检测 adsbygoogle 类型
    if (window.adsbygoogle instanceof Array) {
        isAdBlocked = true;
    }
    // 如果检测到广告被屏蔽，显示提示
    if (isAdBlocked) {
        showAdNotice();
    }
}

// 显示广告提示浮窗
function showAdNotice() {
    const modal = document.getElementById('adNoticeModal');
    modal.classList.add('active');
}

// 关闭广告提示浮窗
function closeAdNotice() {
    const modal = document.getElementById('adNoticeModal');
    modal.classList.remove('active');
}

// 页面加载完成后检查广告状态
document.addEventListener('DOMContentLoaded', () => {
    // 等待一段时间后检查广告状态，确保广告加载完成
    setTimeout(checkAdBlocker, 1000);
});

// 推送Google广告
(adsbygoogle = window.adsbygoogle || []).push({});
