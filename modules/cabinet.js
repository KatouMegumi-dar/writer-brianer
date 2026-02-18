// modules/cabinet.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    const state = {
        root: null,
        chat: null,
        chancellorLabel: null,
        scholarCount: null,
        messages: []
    };

    function ensurePanelInjected() {
        if (state.root) return;
        const tpl = WBAP.UI_TEMPLATES?.CABINET_PANEL_HTML;
        if (!tpl) {
            Logger.warn('未找到内阁面板模板');
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.innerHTML = tpl.trim();
        const root = wrapper.firstElementChild;
        if (!root) return;
        document.body.appendChild(root);

        state.root = root;
        state.chat = root.querySelector('#wbap-cabinet-chat');
        state.chancellorLabel = root.querySelector('#wbap-cabinet-chancellor-label');
        state.scholarCount = root.querySelector('#wbap-cabinet-scholar-count');

        root.querySelector('#wbap-cabinet-close')?.addEventListener('click', close);
    }

    function open() {
        ensurePanelInjected();
        if (!state.root) return;
        state.root.classList.add('open');
        WBAP.syncMobileRootFix?.();
    }

    function close() {
        if (!state.root) return;
        state.root.classList.remove('open');
        WBAP.syncMobileRootFix?.();
    }

    function reset() {
        state.messages = [];
        renderMessages();
    }

    function setMeta({ chancellorName, scholarTotal }) {
        if (state.chancellorLabel) {
            state.chancellorLabel.textContent = chancellorName || '未设置';
        }
        if (state.scholarCount) {
            state.scholarCount.textContent = Number.isFinite(scholarTotal) ? String(scholarTotal) : '0';
        }
    }

    function buildLabel(message) {
        const role = message.role || 'system';
        const round = Number.isFinite(message.round) ? message.round : null;
        const name = message.name ? ` · ${message.name}` : '';
        let base = '系统';
        if (role === 'chancellor') base = '宰相';
        if (role === 'scholar') base = '大学士';
        const roundLabel = round != null ? ` · 第${round}轮` : '';
        return `${base}${name}${roundLabel}`;
    }

    function addMessage(message) {
        if (!message) return;
        const entry = {
            role: message.role || 'system',
            name: message.name || '',
            content: message.content || '',
            round: message.round
        };
        entry.label = message.label || buildLabel(entry);
        state.messages.push(entry);
        renderMessages();
    }

    function renderMessages() {
        if (!state.chat) return;
        state.chat.innerHTML = '';
        state.messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = `wbap-opt-bubble ${msg.role === 'user' ? 'user' : 'ai'}`;
            const content = document.createElement('div');
            content.className = 'wbap-opt-bubble-content';

            const meta = document.createElement('div');
            meta.className = 'wbap-cabinet-meta';
            meta.textContent = msg.label || '';

            const body = document.createElement('div');
            body.className = 'wbap-cabinet-text';
            body.textContent = msg.content || '';

            content.appendChild(meta);
            content.appendChild(body);
            bubble.appendChild(content);
            state.chat.appendChild(bubble);
        });
        state.chat.scrollTop = state.chat.scrollHeight;
    }

    window.WBAP.CabinetUI = {
        open,
        close,
        reset,
        addMessage,
        setMeta
    };
})();
