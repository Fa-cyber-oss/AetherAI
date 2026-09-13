/**
 * Aether AI Application Logic
 * Implements session management, chat streaming, markdown rendering,
 * syntax highlighting, voice recognition, TTS, and UI interactions.
 */

import { AIService } from './ai-service.js';
import { LiveWallpaper } from './wallpaper.js';

// --- State Variables ---
const STORAGE_KEY_SESSIONS = 'aether_ai_sessions_v1';
const STORAGE_KEY_ACTIVE = 'aether_ai_active_session_id';
const STORAGE_KEY_SETTINGS = 'aether_ai_settings_v1';
const STORAGE_KEY_THEME = 'aether_ai_theme';

let sessions = [];
let activeSessionId = null;
let isGenerating = false;
let currentAbortController = null;
let currentAttachment = null;
let isSpeechActive = false;
let speechRecognition = null;

// Settings Default
let appConfig = {
  provider: 'simulated',
  apiKey: '',
  model: 'gemini-3.6-flash',
  temperature: 0.7,
  systemPrompt: 'You are Aether AI, a knowledgeable, articulate, and friendly AI assistant.'
};

// Available Models by Provider
const PROVIDER_MODELS = {
  simulated: [
    { id: 'simulated-engine', name: 'Aether Neural Engine 3.0' }
  ],
  gemini: [
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Recommended & Latest) ✨' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Advanced Reasoning)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Smart)' },
    { id: 'gpt-4o', name: 'GPT-4o (Omni Flagship)' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
  ]
};

// Initialize AI Service
const aiService = new AIService(appConfig);

// --- DOM References ---
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const newChatBtn = document.getElementById('newChatBtn');
const searchInput = document.getElementById('searchInput');
const conversationsList = document.getElementById('conversationsList');
const settingsBtn = document.getElementById('settingsBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const activeModelBadge = document.getElementById('activeModelBadge');
const modelPopover = document.getElementById('modelPopover');
const popoverModelsList = document.getElementById('popoverModelsList');
const popoverSettingsBtn = document.getElementById('popoverSettingsBtn');
const displayModelName = document.getElementById('displayModelName');
const exportChatBtn = document.getElementById('exportChatBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const chatViewport = document.getElementById('chatViewport');
const welcomeHero = document.getElementById('welcomeHero');
const messagesContainer = document.getElementById('messagesContainer');
const chatForm = document.getElementById('chatForm');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const attachmentPreviewBox = document.getElementById('attachmentPreviewBox');
const previewFilename = document.getElementById('previewFilename');
const removeAttachmentBtn = document.getElementById('removeAttachmentBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const providerSelect = document.getElementById('providerSelect');
const apiKeyGroup = document.getElementById('apiKeyGroup');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyLink = document.getElementById('apiKeyLink');
const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');
const modelSelectGroup = document.getElementById('modelSelectGroup');
const modelSelect = document.getElementById('modelSelect');
const systemPromptInput = document.getElementById('systemPromptInput');
const tempSlider = document.getElementById('tempSlider');
const tempVal = document.getElementById('tempVal');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const settingsLink = document.getElementById('settingsLink');
const toastContainer = document.getElementById('toastContainer');

// --- Initialization ---
function init() {
  loadTheme();
  try {
    new LiveWallpaper('bgCanvas');
  } catch (e) {
    console.warn('Live wallpaper init error:', e);
  }
  loadSettings();
  loadSessions();
  setupSpeechRecognition();
  bindEvents();
  renderConversationsList();
  renderActiveChat();
  updateModelBadge();
  setupCinematicOpening();
}

// --- Fantastic Cinematic Opening Animation ---
function setupCinematicOpening() {
  const intro = document.getElementById('introOverlay');
  const layout = document.getElementById('appLayout');

  if (!intro || !layout) return;

  // Let the intro shine for 850ms, then smoothly dismiss and reveal workspace
  setTimeout(() => {
    intro.classList.add('dismissed');
    layout.classList.add('app-ready');

    // Remove intro from DOM after transition completes to free memory
    setTimeout(() => {
      intro.style.display = 'none';
    }, 800);
  }, 900);

  // Easter Egg: Clicking the brand logo triggers a replay of the fantastic reveal
  const brandEl = document.querySelector('.sidebar .brand');
  if (brandEl) {
    brandEl.style.cursor = 'pointer';
    brandEl.title = 'Click to replay opening animation ✨';
    brandEl.onclick = () => {
      intro.style.display = 'flex';
      intro.classList.remove('dismissed');
      layout.classList.remove('app-ready');
      setTimeout(() => {
        intro.classList.add('dismissed');
        layout.classList.add('app-ready');
        setTimeout(() => {
          intro.style.display = 'none';
        }, 800);
      }, 850);
    };
  }
}

// --- Persistence & Config ---
function loadTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(STORAGE_KEY_THEME, newTheme);
  showToast(`Switched to ${newTheme} mode`, 'info');
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (saved) {
      appConfig = { ...appConfig, ...JSON.parse(saved) };
    }
    // Auto-migrate legacy or deprecated models like gemini-2.0-flash
    if (appConfig.model === 'gemini-2.0-flash' || appConfig.model === 'gemini-2.0' || !appConfig.model) {
      appConfig.model = 'gemini-3.6-flash';
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(appConfig));
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  aiService.updateConfig(appConfig);
}

function saveSettings() {
  appConfig.provider = providerSelect.value;
  appConfig.apiKey = apiKeyInput.value.trim();
  appConfig.model = modelSelect.value;
  appConfig.systemPrompt = systemPromptInput.value.trim();
  appConfig.temperature = parseFloat(tempSlider.value);

  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(appConfig));
  aiService.updateConfig(appConfig);
  updateModelBadge();
  closeModal();
  showToast('Settings saved successfully!', 'success');
}

function resetSettings() {
  appConfig = {
    provider: 'simulated',
    apiKey: '',
    model: 'gemini-3.6-flash',
    temperature: 0.7,
    systemPrompt: 'You are Aether AI, a knowledgeable, articulate, and friendly AI assistant.'
  };
  localStorage.removeItem(STORAGE_KEY_SETTINGS);
  aiService.updateConfig(appConfig);
  populateSettingsForm();
  updateModelBadge();
  showToast('Settings restored to defaults', 'info');
}

function updateModelBadge() {
  if (appConfig.provider === 'simulated') {
    displayModelName.textContent = 'Aether Neural Engine ✨';
  } else if (appConfig.provider === 'gemini') {
    const modelObj = PROVIDER_MODELS.gemini.find(m => m.id === appConfig.model);
    displayModelName.textContent = modelObj ? modelObj.name : 'Google Gemini';
  } else if (appConfig.provider === 'openai') {
    const modelObj = PROVIDER_MODELS.openai.find(m => m.id === appConfig.model);
    displayModelName.textContent = modelObj ? modelObj.name : 'ChatGPT (OpenAI)';
  }
}

// --- Session & History Management ---
function loadSessions() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SESSIONS);
    sessions = saved ? JSON.parse(saved) : [];
  } catch (e) {
    sessions = [];
  }

  activeSessionId = localStorage.getItem(STORAGE_KEY_ACTIVE);

  // If no sessions exist, create a fresh one
  if (!sessions.length) {
    createNewSession(false);
  } else if (!sessions.some(s => s.id === activeSessionId)) {
    activeSessionId = sessions[0].id;
  }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    localStorage.setItem(STORAGE_KEY_ACTIVE, activeSessionId);
  } catch (e) {
    console.error('Failed to save sessions:', e);
  }
}

function createNewSession(switchToIt = true) {
  const newId = 'session_' + Date.now();
  const newSession = {
    id: newId,
    title: 'New conversation',
    createdAt: new Date().toISOString(),
    messages: []
  };

  sessions.unshift(newSession);
  if (switchToIt) {
    activeSessionId = newId;
    renderConversationsList();
    renderActiveChat();
    promptInput.focus();
    if (window.innerWidth < 860) closeSidebar();
  }
  saveSessions();
  return newSession;
}

function getActiveSession() {
  return sessions.find(s => s.id === activeSessionId) || sessions[0];
}

function deleteSession(id, event) {
  if (event) event.stopPropagation();
  if (sessions.length <= 1) {
    // Just clear the single session
    const current = getActiveSession();
    current.messages = [];
    current.title = 'New conversation';
    saveSessions();
    renderConversationsList();
    renderActiveChat();
    showToast('Conversation cleared', 'info');
    return;
  }

  sessions = sessions.filter(s => s.id !== id);
  if (activeSessionId === id) {
    activeSessionId = sessions[0].id;
  }
  saveSessions();
  renderConversationsList();
  renderActiveChat();
  showToast('Chat deleted', 'info');
}

function renameSession(id, event) {
  if (event) event.stopPropagation();
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  const newTitle = prompt('Rename conversation:', session.title);
  if (newTitle && newTitle.trim()) {
    session.title = newTitle.trim();
    saveSessions();
    renderConversationsList();
  }
}

function clearAllConversations() {
  if (confirm('Are you sure you want to delete all conversations?')) {
    sessions = [];
    createNewSession(true);
    showToast('All chat history cleared', 'info');
  }
}

// --- Render Sidebar ---
function renderConversationsList(filterText = '') {
  conversationsList.innerHTML = '';
  const filtered = sessions.filter(s => 
    s.title.toLowerCase().includes(filterText.toLowerCase())
  );

  if (filtered.length === 0) {
    conversationsList.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:10px;">No chats found</div>`;
    return;
  }

  filtered.forEach(session => {
    const item = document.createElement('div');
    item.className = `chat-item ${session.id === activeSessionId ? 'active' : ''}`;
    item.onclick = () => {
      activeSessionId = session.id;
      renderConversationsList();
      renderActiveChat();
      if (window.innerWidth < 860) closeSidebar();
    };

    item.innerHTML = `
      <span class="chat-item-title" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
      <div class="chat-item-actions">
        <button class="chat-action-btn edit-btn" title="Rename chat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
        <button class="chat-action-btn delete-btn" title="Delete chat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    item.querySelector('.edit-btn').onclick = (e) => renameSession(session.id, e);
    item.querySelector('.delete-btn').onclick = (e) => deleteSession(session.id, e);

    conversationsList.appendChild(item);
  });
}

// --- Render Chat Area ---
function renderActiveChat() {
  const session = getActiveSession();
  if (!session || session.messages.length === 0) {
    welcomeHero.style.display = 'flex';
    messagesContainer.innerHTML = '';
  } else {
    welcomeHero.style.display = 'none';
    messagesContainer.innerHTML = '';
    session.messages.forEach(msg => {
      appendMessageToDOM(msg, false);
    });
    scrollToBottom();
  }
}

function appendMessageToDOM(msg, shouldScroll = true) {
  welcomeHero.style.display = 'none';

  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  row.id = `msg_${msg.id}`;

  const isUser = msg.role === 'user';
  const avatar = isUser ? '👤' : '✨';
  const senderName = isUser ? 'You' : 'Aether AI';

  row.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content-wrapper">
      <div class="message-header">
        <span class="sender-name">${senderName}</span>
        <span class="message-timestamp">${msg.timestamp || ''}</span>
      </div>
      <div class="message-bubble">${renderMarkdown(msg.content)}</div>
      ${!isUser ? `
        <div class="message-actions">
          <button class="msg-action-btn copy-msg-btn" title="Copy response">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
          <button class="msg-action-btn speak-msg-btn" title="Read aloud">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <span>Listen</span>
          </button>
          <button class="msg-action-btn regen-msg-btn" title="Regenerate">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
            <span>Regenerate</span>
          </button>
        </div>
      ` : ''}
    </div>
  `;

  messagesContainer.appendChild(row);

  // Apply code highlighting & copy buttons
  postProcessCodeBlocks(row);

  // Attach action button events
  if (!isUser) {
    const copyBtn = row.querySelector('.copy-msg-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(msg.content);
        showToast('Response copied to clipboard!', 'success');
      };
    }

    const speakBtn = row.querySelector('.speak-msg-btn');
    if (speakBtn) {
      speakBtn.onclick = () => toggleSpeech(msg.content, speakBtn);
    }

    const regenBtn = row.querySelector('.regen-msg-btn');
    if (regenBtn) {
      regenBtn.onclick = () => regenerateResponse(msg.id);
    }
  }

  if (shouldScroll) scrollToBottom();
  return row;
}

// --- Markdown Rendering & Code Block Polishing ---
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text);
  }
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function postProcessCodeBlocks(container) {
  const pres = container.querySelectorAll('pre');
  pres.forEach(pre => {
    // Avoid double wrapping
    if (pre.parentElement.classList.contains('code-block-wrapper')) return;

    const codeEl = pre.querySelector('code');
    if (!codeEl) return;

    // Detect language
    let lang = 'code';
    const classes = codeEl.className.split(' ');
    for (const cls of classes) {
      if (cls.startsWith('language-')) {
        lang = cls.replace('language-', '');
        break;
      }
    }

    // Syntax highlight
    if (typeof hljs !== 'undefined') {
      hljs.highlightElement(codeEl);
    }

    // Create custom wrapper & header
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';

    const header = document.createElement('div');
    header.className = 'code-block-header';
    header.innerHTML = `
      <span class="code-lang">${lang.toUpperCase()}</span>
      <button class="copy-code-btn" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy code</span>
      </button>
    `;

    const copyBtn = header.querySelector('.copy-code-btn');
    copyBtn.onclick = () => {
      const codeText = codeEl.innerText;
      navigator.clipboard.writeText(codeText);
      copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span style="color:#10b981">Copied!</span>
      `;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy code</span>
        `;
      }, 2000);
    };

    // Insert wrapper into DOM
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

function scrollToBottom() {
  chatViewport.scrollTop = chatViewport.scrollHeight;
}

// --- Sending & Streaming Messages ---
async function handleSend(customText = null) {
  if (isGenerating) {
    // If generating, clicking the send button stops generation
    stopGeneration();
    return;
  }

  const rawText = customText !== null ? customText : promptInput.value.trim();
  if (!rawText && !currentAttachment) return;

  // Build full message text if attachment exists
  let fullPrompt = rawText;
  if (currentAttachment) {
    fullPrompt = `[Attached File: ${currentAttachment.name}]\n\`\`\`\n${currentAttachment.content}\n\`\`\`\n\n${rawText}`;
    clearAttachment();
  }

  promptInput.value = '';
  adjustInputHeight();
  updateSendButtonState();

  const session = getActiveSession();

  // If this is the first message in the session, set the title automatically
  if (session.messages.length === 0) {
    session.title = rawText.slice(0, 36) + (rawText.length > 36 ? '...' : '');
    renderConversationsList();
  }

  // 1. Add User Message
  const userMsg = {
    id: 'msg_' + Date.now(),
    role: 'user',
    content: fullPrompt,
    timestamp: getCurrentTimeStr()
  };
  session.messages.push(userMsg);
  appendMessageToDOM(userMsg);

  // 2. Prepare Assistant Message Placeholder
  const assistantMsgId = 'msg_' + (Date.now() + 1);
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    timestamp: getCurrentTimeStr()
  };
  session.messages.push(assistantMsg);

  // Append temporary row to DOM
  const aiRow = appendMessageToDOM(assistantMsg);
  const bubble = aiRow.querySelector('.message-bubble');
  bubble.innerHTML = '<span class="streaming-cursor"></span>';

  // 3. Initiate Streaming
  startGenerationState();
  currentAbortController = new AbortController();

  let accumulatedContent = '';

  try {
    const historyPayload = session.messages.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content
    }));

    await aiService.streamResponse(historyPayload, {
      signal: currentAbortController.signal,
      onChunk: (chunk) => {
        accumulatedContent += chunk;
        bubble.innerHTML = renderMarkdown(accumulatedContent) + '<span class="streaming-cursor"></span>';
        postProcessCodeBlocks(aiRow);
        scrollToBottom();
      }
    });

    // Finished streaming
    assistantMsg.content = accumulatedContent;
    bubble.innerHTML = renderMarkdown(accumulatedContent);
    postProcessCodeBlocks(aiRow);
    saveSessions();

  } catch (err) {
    if (err.name === 'AbortError') {
      assistantMsg.content = accumulatedContent + '\n\n*(Generation stopped by user)*';
      bubble.innerHTML = renderMarkdown(assistantMsg.content);
      postProcessCodeBlocks(aiRow);
      saveSessions();
      showToast('Generation paused', 'info');
    } else {
      console.error('Error generating AI response:', err);
      const errMsg = `⚠️ **Error Generating Response:**\n${err.message || 'An unexpected error occurred.'}\n\n*Check your API Key in Settings or switch to Built-in Smart Engine.*`;
      assistantMsg.content = errMsg;
      bubble.innerHTML = renderMarkdown(errMsg);
      saveSessions();
      showToast(err.message || 'Generation error', 'error');
    }
  } finally {
    endGenerationState();
    scrollToBottom();
  }
}

function startGenerationState() {
  isGenerating = true;
  sendBtn.classList.add('generating');
  sendBtn.title = 'Stop generating';
  sendBtn.disabled = false;
}

function endGenerationState() {
  isGenerating = false;
  sendBtn.classList.remove('generating');
  sendBtn.title = 'Send message';
  currentAbortController = null;
  updateSendButtonState();
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

async function regenerateResponse(msgId) {
  if (isGenerating) return;
  const session = getActiveSession();
  const idx = session.messages.findIndex(m => m.id === msgId);
  if (idx <= 0) return;

  // Find user prompt preceding this message
  const prevUserMsg = session.messages[idx - 1];
  if (!prevUserMsg || prevUserMsg.role !== 'user') return;

  // Remove the assistant message and everything after it
  session.messages = session.messages.slice(0, idx);
  renderActiveChat();

  // Re-trigger with user prompt
  promptInput.value = prevUserMsg.content;
  // Pop the user message so handleSend re-adds it
  session.messages.pop();
  handleSend();
}

// --- Text-to-Speech (TTS) ---
function toggleSpeech(text, btnElement) {
  if (!('speechSynthesis' in window)) {
    showToast('Text-to-speech is not supported in this browser', 'info');
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.speak-msg-btn').forEach(b => b.classList.remove('speaking'));
    return;
  }

  // Clean markdown tags for natural speech
  const cleanText = text.replace(/[#*`_\[\]()]/g, '').replace(/```[\s\S]*?```/g, 'Code block omitted.');
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;

  btnElement.classList.add('speaking');
  btnElement.querySelector('span').textContent = 'Stop';

  utterance.onend = () => {
    btnElement.classList.remove('speaking');
    btnElement.querySelector('span').textContent = 'Listen';
  };

  utterance.onerror = () => {
    btnElement.classList.remove('speaking');
    btnElement.querySelector('span').textContent = 'Listen';
  };

  window.speechSynthesis.speak(utterance);
}

// --- Speech-to-Text (Mic Voice Input) ---
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.opacity = '0.5';
    micBtn.title = 'Voice input not supported in this browser';
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;
  speechRecognition.lang = 'en-US';

  speechRecognition.onstart = () => {
    isSpeechActive = true;
    micBtn.classList.add('recording');
    showToast('Listening... Speak now', 'info');
  };

  speechRecognition.onresult = (e) => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      transcript += e.results[i][0].transcript;
    }
    promptInput.value = transcript;
    adjustInputHeight();
    updateSendButtonState();
  };

  speechRecognition.onend = () => {
    isSpeechActive = false;
    micBtn.classList.remove('recording');
  };

  speechRecognition.onerror = (e) => {
    isSpeechActive = false;
    micBtn.classList.remove('recording');
    showToast(`Voice input error: ${e.error}`, 'error');
  };
}

function toggleVoiceInput() {
  if (!speechRecognition) {
    showToast('Voice speech recognition is not supported in this browser environment', 'info');
    return;
  }

  if (isSpeechActive) {
    speechRecognition.stop();
  } else {
    try {
      speechRecognition.start();
    } catch (e) {
      console.warn('Speech start error:', e);
    }
  }
}

// --- File Attachment Handling ---
function handleFileUpload(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    currentAttachment = {
      name: file.name,
      content: e.target.result
    };
    previewFilename.textContent = file.name;
    attachmentPreviewBox.style.display = 'block';
    updateSendButtonState();
    showToast(`Attached ${file.name}`, 'info');
  };

  if (file.type.startsWith('image/')) {
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file);
  }
}

function clearAttachment() {
  currentAttachment = null;
  fileInput.value = '';
  attachmentPreviewBox.style.display = 'none';
  updateSendButtonState();
}

// --- Export Conversation ---
function exportChat() {
  const session = getActiveSession();
  if (!session || session.messages.length === 0) {
    showToast('No messages to export', 'info');
    return;
  }

  let markdown = `# ${session.title}\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
  session.messages.forEach(m => {
    const sender = m.role === 'user' ? '### 👤 You' : '### ✨ Aether AI';
    markdown += `${sender} (${m.timestamp || ''})\n\n${m.content}\n\n---\n\n`;
  });

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Chat exported as Markdown!', 'success');
}

// --- Settings Modal Logic ---
function openModal() {
  populateSettingsForm();
  settingsModal.style.display = 'flex';
}

function closeModal() {
  settingsModal.style.display = 'none';
}

function populateSettingsForm() {
  providerSelect.value = appConfig.provider;
  apiKeyInput.value = appConfig.apiKey || '';
  tempSlider.value = appConfig.temperature;
  tempVal.textContent = appConfig.temperature;
  systemPromptInput.value = appConfig.systemPrompt || '';

  updateProviderFormFields();
}

function updateProviderFormFields() {
  const provider = providerSelect.value;
  const models = PROVIDER_MODELS[provider] || [];

  // Populate model dropdown
  modelSelect.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    modelSelect.appendChild(opt);
  });

  if (models.some(m => m.id === appConfig.model)) {
    modelSelect.value = appConfig.model;
  } else if (models.length > 0) {
    modelSelect.value = models[0].id;
    appConfig.model = models[0].id;
  }

  if (provider === 'simulated') {
    apiKeyGroup.style.display = 'none';
    modelSelectGroup.style.display = 'none';
  } else {
    apiKeyGroup.style.display = 'flex';
    modelSelectGroup.style.display = 'flex';

    if (provider === 'gemini') {
      apiKeyLink.href = 'https://aistudio.google.com/app/apikey';
      apiKeyLink.textContent = 'Get free Gemini API Key →';
      apiKeyInput.placeholder = 'AIzaSy...';
    } else {
      apiKeyLink.href = 'https://platform.openai.com/api-keys';
      apiKeyLink.textContent = 'Get OpenAI API Key →';
      apiKeyInput.placeholder = 'sk-...';
    }
  }
}

// --- Quick Model Selector Popover Logic ---
function toggleModelPopover(e) {
  if (e) e.stopPropagation();
  const isHidden = modelPopover.style.display === 'none' || !modelPopover.style.display;
  if (isHidden) {
    renderModelPopover();
    modelPopover.style.display = 'block';
    activeModelBadge.classList.add('active');
    activeModelBadge.setAttribute('aria-expanded', 'true');
  } else {
    closeModelPopover();
  }
}

function closeModelPopover() {
  if (modelPopover) {
    modelPopover.style.display = 'none';
  }
  if (activeModelBadge) {
    activeModelBadge.classList.remove('active');
    activeModelBadge.setAttribute('aria-expanded', 'false');
  }
}

function renderModelPopover() {
  if (!popoverModelsList) return;
  popoverModelsList.innerHTML = '';

  const groups = [
    {
      provider: 'gemini',
      label: '✨ Google Gemini Models',
      desc: 'Latest high-intelligence Gemini cloud models'
    },
    {
      provider: 'openai',
      label: '🤖 OpenAI Models',
      desc: 'Industry standard ChatGPT models'
    },
    {
      provider: 'simulated',
      label: '⚡ Built-in Smart Engine',
      desc: 'Instant offline responses (No key required)'
    }
  ];

  groups.forEach(group => {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'popover-group-label';
    groupLabel.textContent = group.label;
    popoverModelsList.appendChild(groupLabel);

    const models = PROVIDER_MODELS[group.provider] || [];
    models.forEach(model => {
      const isCurrent = appConfig.provider === group.provider && appConfig.model === model.id;
      const item = document.createElement('div');
      item.className = `popover-model-item ${isCurrent ? 'active' : ''}`;
      item.innerHTML = `
        <div class="popover-model-info">
          <span class="popover-model-name">${model.name}</span>
          <span class="popover-model-desc">${group.desc}</span>
        </div>
        <span class="popover-check">✓</span>
      `;

      item.onclick = (e) => {
        e.stopPropagation();
        selectModelFromPopover(group.provider, model.id, model.name);
      };

      popoverModelsList.appendChild(item);
    });
  });
}

function selectModelFromPopover(provider, modelId, modelName) {
  appConfig.provider = provider;
  appConfig.model = modelId;

  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(appConfig));
  aiService.updateConfig(appConfig);
  updateModelBadge();
  closeModelPopover();

  if (provider === 'gemini' && !appConfig.apiKey) {
    showToast(`Switched to ${modelName}. Add your Gemini API Key in Settings to chat!`, 'info');
    openModal();
  } else if (provider === 'openai' && !appConfig.apiKey) {
    showToast(`Switched to ${modelName}. Add your OpenAI API Key in Settings to chat!`, 'info');
    openModal();
  } else {
    showToast(`Active model: ${modelName}`, 'success');
  }
}

// --- Toast Feedback ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// --- Event Listeners Setup ---
function bindEvents() {
  // Mobile drawer
  mobileMenuBtn.onclick = openSidebar;
  closeSidebarBtn.onclick = closeSidebar;
  sidebarBackdrop.onclick = closeSidebar;

  // New Chat
  newChatBtn.onclick = () => createNewSession(true);

  // Search
  searchInput.oninput = (e) => renderConversationsList(e.target.value);

  // Clear & Export
  clearAllBtn.onclick = clearAllConversations;
  clearChatBtn.onclick = () => {
    const current = getActiveSession();
    current.messages = [];
    current.title = 'New conversation';
    saveSessions();
    renderConversationsList();
    renderActiveChat();
    showToast('Conversation cleared', 'info');
  };
  exportChatBtn.onclick = exportChat;

  // Theme
  themeToggleBtn.onclick = toggleTheme;

  // Settings
  settingsBtn.onclick = openModal;
  settingsLink.onclick = (e) => { e.preventDefault(); openModal(); };
  closeSettingsBtn.onclick = closeModal;
  settingsModal.onclick = (e) => { if (e.target === settingsModal) closeModal(); };
  saveSettingsBtn.onclick = saveSettings;
  resetSettingsBtn.onclick = resetSettings;
  providerSelect.onchange = updateProviderFormFields;

  tempSlider.oninput = (e) => {
    tempVal.textContent = e.target.value;
  };

  toggleApiKeyVisibility.onclick = () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyVisibility.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyVisibility.textContent = '👁️';
    }
  };

  // Prompt Cards
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.onclick = () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) handleSend(prompt);
    };
  });

  // Chat Form & Input
  chatForm.onsubmit = (e) => {
    e.preventDefault();
    handleSend();
  };

  promptInput.oninput = () => {
    adjustInputHeight();
    updateSendButtonState();
  };

  promptInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Model Quick-Select Popover
  if (activeModelBadge) {
    activeModelBadge.onclick = toggleModelPopover;
  }
  if (popoverSettingsBtn) {
    popoverSettingsBtn.onclick = (e) => {
      e.stopPropagation();
      closeModelPopover();
      openModal();
    };
  }
  document.addEventListener('click', (e) => {
    if (modelPopover && !modelPopover.contains(e.target) && !activeModelBadge.contains(e.target)) {
      closeModelPopover();
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      createNewSession(true);
    }
    if (e.key === 'Escape') {
      if (modelPopover && modelPopover.style.display === 'block') {
        closeModelPopover();
      }
      if (settingsModal && settingsModal.style.display === 'flex') {
        closeModal();
      }
    }
  });

  // Mic & Voice
  micBtn.onclick = toggleVoiceInput;

  // Attachment
  attachBtn.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };
  removeAttachmentBtn.onclick = clearAttachment;
}

// --- Helper Functions ---
function adjustInputHeight() {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
}

function updateSendButtonState() {
  const hasText = promptInput.value.trim().length > 0;
  const hasAttachment = currentAttachment !== null;
  sendBtn.disabled = !hasText && !hasAttachment && !isGenerating;
}

function openSidebar() {
  sidebar.classList.add('open');
  sidebarBackdrop.classList.add('show');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('show');
}

function getCurrentTimeStr() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Run init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);
