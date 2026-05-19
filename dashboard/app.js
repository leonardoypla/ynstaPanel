const api = new InstagramAPI();

let state = {
    followers: [],
    following: [],
    notFollowingBack: [],
    fans: [],
    mutualFollowing: [],
    mutualFollowers: [],
    currentFollowingFilter: 'all-following',
    currentFollowersFilter: 'all-followers',
    selection: {
        following: new Set(),
        followers: new Set()
    }
};

let cancelQueue = false;

// DOM Elements
const refreshBtn = document.getElementById('refresh-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('progress-bar');

const followingCountEl = document.getElementById('following-count');
const followersCountEl = document.getElementById('followers-count');
const followingListCountEl = document.getElementById('following-list-count');
const followersListCountEl = document.getElementById('followers-list-count');

const followingListEl = document.getElementById('following-list');
const followersListEl = document.getElementById('followers-list');
const filterBtns = document.querySelectorAll('.filter-btn');

// Events
document.addEventListener('DOMContentLoaded', loadFromCache);
refreshBtn.addEventListener('click', startSync);

document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('user-checkbox')) {
        handleSelection(e);
    }
});

document.addEventListener('click', (e) => {
    const aiBtn = e.target.closest('.ai-btn');
    if (aiBtn && aiBtn.getAttribute('data-action') === 'analyze') {
        const id = aiBtn.getAttribute('data-id');
        const username = aiBtn.getAttribute('data-username');
        const avatar = aiBtn.getAttribute('data-avatar');
        openAnalysisModal(id, username, avatar);
    }
});

document.getElementById('btn-unfollow').addEventListener('click', () => executeQueue('following', 'unfollow'));
document.getElementById('btn-follow-back').addEventListener('click', () => executeQueue('followers', 'follow'));
document.getElementById('btn-remove-follower').addEventListener('click', () => executeQueue('followers', 'remove'));

filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = e.target.getAttribute('data-target');
        
        // Remove active class from siblings
        e.target.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        if (target.includes('following')) {
            state.currentFollowingFilter = target;
            renderFollowingList();
        } else {
            state.currentFollowersFilter = target;
            renderFollowersList();
        }
    });
});

async function startSync() {
    try {
        loadingOverlay.classList.remove('hidden');
        progressBar.style.width = '5%';
        loadingStatus.innerText = "Verificando sessão do Instagram...";
        
        await api.init();
        
        // Buscar quem você segue
        loadingStatus.innerText = "Iniciando extração (Quem você segue)...";
        state.following = await api.getFollowing((status, count) => {
            loadingStatus.innerText = status;
            progressBar.style.width = Math.min(10 + (count / 10), 45) + '%';
        });

        // Buscar seguidores
        loadingStatus.innerText = "Iniciando extração (Quem te segue)...";
        state.followers = await api.getFollowers((status, count) => {
            loadingStatus.innerText = status;
            progressBar.style.width = Math.min(50 + (count / 10), 90) + '%';
        });

        loadingStatus.innerText = "Cruzando dados...";
        progressBar.style.width = '95%';
        await api.sleep(1000);

        processData();
        renderData();
        saveToCache();

        progressBar.style.width = '100%';
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
        }, 500);

    } catch (error) {
        alert("Erro: " + error.message);
        loadingOverlay.classList.add('hidden');
    }
}

function processData() {
    const followersSet = new Set(state.followers.map(u => u.username));
    const followingSet = new Set(state.following.map(u => u.username));

    // Quem eu sigo mas não me segue de volta
    state.notFollowingBack = state.following.filter(u => !followersSet.has(u.username));

    // Quem me segue mas eu não sigo (Fãs)
    state.fans = state.followers.filter(u => !followingSet.has(u.username));

    // Mútuos (Seguem de volta)
    state.mutualFollowing = state.following.filter(u => followersSet.has(u.username));
    state.mutualFollowers = state.followers.filter(u => followingSet.has(u.username));
}

function renderData() {
    followingCountEl.innerText = state.following.length;
    followersCountEl.innerText = state.followers.length;

    renderFollowingList();
    renderFollowersList();
}

function createUserHTML(user, badgeHTML = '', listType) {
    // Usamos um placeholder se a imagem falhar devido a CORS/bloqueio
    const isChecked = state.selection[listType].has(user.id) ? 'checked' : '';
    return `
        <div class="user-item">
            <div class="user-item-left">
                <input type="checkbox" class="user-checkbox" data-id="${user.id}" data-list="${listType}" ${isChecked}>
                <div class="user-info-wrapper">
                    <img class="avatar" src="${user.profile_pic_url}" alt="${user.username}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NjYyI+PHBhdGggZD0iTTEyIDJDMi42MDYgMiAyIDEyLjYwNiAyIDEyczEwLjYwNiAxMCAxMCAxMCAxMC0xMC42MDYgMTAtMTBTMjEuMzk0IDIgMTIgMnptMCAxOGMtNC40MSAwLTgtMy41OS04LThzMy41OS04IDgtOCA4IDMuNTkgOCA4LTMuNTkgOC04IDh6bTAtMTRjLTIuMjA2IDAtNCAxLjc5NC00IDRzMS43OTQgNCA0 NCA0LTEuNzk0IDQtNCAxLjc5NC00IDQtNHptMCA2Yy0xLjEwMyAwLTItLjg5Ny0yLTJzLjg5Ny0yIDItMiAyIC44OTcgMiAyLS44OTcgMi0yIDJ6bTQtMWMtLjI4NS0xLjcxMS0xLjcxLTEuNzExLTItMS43MTEtLjI5IDAtMS43MTUgMC0yIDEuNzExQzkuMzggMTguMDA2IDYuMDggMTguMDA2IDYuMDggMTguMDA2YzAgMi4xMDMgMS40NyAzLjA0IDMuODIgMy4yMjEgMS43MjIuMTMyIDMuMjIyLS41MTggMy4yMjItLjUxOHMxLjUwMS42NSAzLjIyMi41MThjMi4zNTEtLjE4MSAzLjgyLTEuMTE4IDMuODItMy4yMjEgMCAwLTMuMyAwLTMuOTItMS4wMDZ6Ii8+PC9zdmc+'">
                    <div class="user-details">
                        <a href="https://instagram.com/${user.username}" target="_blank" class="username">${user.username}</a>
                        <span class="fullname">${user.full_name}</span>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                ${badgeHTML}
                <button class="ai-btn" data-action="analyze" data-id="${user.id}" data-username="${user.username}" data-avatar="${user.profile_pic_url}">✨ IA</button>
            </div>
        </div>
    `;
}

function renderFollowingList() {
    let list = state.following;
    if (state.currentFollowingFilter === 'not-following-back') {
        list = state.notFollowingBack;
    } else if (state.currentFollowingFilter === 'mutual-following') {
        list = state.mutualFollowing;
    }

    followingListCountEl.innerText = list.length;

    if (list.length === 0) {
        followingListEl.innerHTML = '<div class="empty-state">Nenhum usuário encontrado.</div>';
        return;
    }

    const followersSet = new Set(state.followers.map(u => u.username));

    let html = '';
    list.forEach(user => {
        let badge = '';
        if (!followersSet.has(user.username)) {
            badge = '<span class="status-badge status-not-following">Não segue de volta</span>';
        } else {
            badge = '<span class="status-badge status-mutual">Mútuos</span>';
        }
        html += createUserHTML(user, badge, 'following');
    });

    followingListEl.innerHTML = html;
}

function renderFollowersList() {
    let list = state.followers;
    if (state.currentFollowersFilter === 'fans') {
        list = state.fans;
    } else if (state.currentFollowersFilter === 'mutual-followers') {
        list = state.mutualFollowers;
    }

    followersListCountEl.innerText = list.length;

    if (list.length === 0) {
        followersListEl.innerHTML = '<div class="empty-state">Nenhum usuário encontrado.</div>';
        return;
    }

    const followingSet = new Set(state.following.map(u => u.username));

    let html = '';
    list.forEach(user => {
        let badge = '';
        if (!followingSet.has(user.username)) {
            badge = '<span class="status-badge status-fan">Fã</span>';
        } else {
            badge = '<span class="status-badge status-mutual">Mútuos</span>';
        }
        html += createUserHTML(user, badge, 'followers');
    });

    followersListEl.innerHTML = html;
}

// Cache Functions
function saveToCache() {
    const dataToSave = {
        followers: state.followers,
        following: state.following,
        lastSync: new Date().getTime()
    };
    try {
        localStorage.setItem('instagram_state', JSON.stringify(dataToSave));
        updateLastSyncDisplay(dataToSave.lastSync);
    } catch (e) {
        console.error("Erro ao salvar no cache:", e);
    }
}

function loadFromCache() {
    try {
        const cached = localStorage.getItem('instagram_state');
        if (cached) {
            const parsed = JSON.parse(cached);
            state.followers = parsed.followers || [];
            state.following = parsed.following || [];
            processData();
            renderData();
            updateLastSyncDisplay(parsed.lastSync);
        }
    } catch (e) {
        console.error("Erro ao carregar cache:", e);
    }
}

function updateLastSyncDisplay(timestamp) {
    const el = document.getElementById('last-sync-time');
    if (el && timestamp) {
        const date = new Date(timestamp);
        el.innerText = `(Última sincronização: ${date.toLocaleDateString()} ${date.toLocaleTimeString()})`;
    }
}

// Bulk Actions Logic
function handleSelection(e) {
    const id = e.target.getAttribute('data-id');
    const list = e.target.getAttribute('data-list');
    
    if (e.target.checked) {
        state.selection[list].add(id);
    } else {
        state.selection[list].delete(id);
    }
    
    updateActionBars();
};

function updateActionBars() {
    const followingBar = document.getElementById('following-action-bar');
    const followersBar = document.getElementById('followers-action-bar');
    
    if (state.selection.following.size > 0) {
        followingBar.classList.remove('hidden');
        document.getElementById('following-selected-count').innerText = state.selection.following.size;
    } else {
        followingBar.classList.add('hidden');
    }
    
    if (state.selection.followers.size > 0) {
        followersBar.classList.remove('hidden');
        document.getElementById('followers-selected-count').innerText = state.selection.followers.size;
    } else {
        followersBar.classList.add('hidden');
    }
}

async function executeQueue(listType, actionType) {
    const idsToProcess = Array.from(state.selection[listType]);
    if (idsToProcess.length === 0) return;

    if (!confirm(`Tem certeza que deseja executar esta ação em ${idsToProcess.length} usuários?`)) return;

    cancelQueue = false;
    loadingOverlay.classList.remove('hidden');
    document.getElementById('cancel-queue-btn').classList.remove('hidden');
    document.getElementById('loading-spinner').style.display = 'block';
    
    document.getElementById('cancel-queue-btn').onclick = () => {
        cancelQueue = true;
    };

    let count = 0;
    const total = idsToProcess.length;

    try {
        await api.init();
        
        for (const id of idsToProcess) {
            if (cancelQueue) {
                alert('Fila cancelada pelo usuário.');
                break;
            }

            count++;
            progressBar.style.width = `${(count / total) * 100}%`;
            loadingStatus.innerText = `Processando ${count} de ${total}...`;
            
            try {
                if (actionType === 'unfollow') {
                    await api.unfollow(id);
                    state.following = state.following.filter(u => u.id !== id);
                } else if (actionType === 'follow') {
                    await api.follow(id);
                    // Como não pegamos todos os detalhes do usuário, ideal seria re-sincronizar depois.
                } else if (actionType === 'remove') {
                    await api.removeFollower(id);
                    state.followers = state.followers.filter(u => u.id !== id);
                }
                
                state.selection[listType].delete(id);
                
                if (count < total && !cancelQueue) {
                    const delay = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;
                    loadingStatus.innerText = `Ação concluída. Pausa de segurança...`;
                    document.getElementById('loading-substatus').innerText = `Aguardando ${(delay/1000).toFixed(0)} segundos para evitar bloqueios.`;
                    await api.sleep(delay);
                    document.getElementById('loading-substatus').innerText = 'Aguarde. Fazendo pausas de segurança para evitar bloqueios.';
                }
                
            } catch (err) {
                console.error('Erro na ação individual', err);
                if (err.message === 'RATE_LIMIT') {
                    alert('O Instagram bloqueou as ações temporariamente. Tente novamente mais tarde.');
                    break;
                }
            }
        }
        
    } catch (err) {
        alert("Erro fatal: " + err.message);
    } finally {
        processData();
        renderData();
        saveToCache();
        updateActionBars();
        
        loadingOverlay.classList.add('hidden');
        document.getElementById('cancel-queue-btn').classList.add('hidden');
        document.getElementById('loading-substatus').innerText = 'Aguarde. Fazendo pausas de segurança para evitar bloqueios.';
    }
};

// AI Modal Logic
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
document.getElementById('settings-btn').addEventListener('click', () => {
    apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
    settingsModal.style.display = 'flex';
});
document.getElementById('close-settings-btn').addEventListener('click', () => {
    settingsModal.style.display = 'none';
});
document.getElementById('save-settings-btn').addEventListener('click', () => {
    localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
    settingsModal.style.display = 'none';
    alert('Chave API salva!');
});

const analysisModal = document.getElementById('analysis-modal');
const aiModalUsername = document.getElementById('ai-modal-username');
const aiModalAvatar = document.getElementById('ai-modal-avatar');
const aiModalStatus = document.getElementById('ai-modal-status');
const aiModalResult = document.getElementById('ai-modal-result');

document.getElementById('close-analysis-btn').addEventListener('click', () => {
    analysisModal.style.display = 'none';
});

async function openAnalysisModal(userId, username, avatar) {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        alert('Por favor, clique no botão "⚙️ API IA" no topo da página e cole sua chave do Google Gemini API primeiro.');
        return;
    }

    analysisModal.style.display = 'flex';
    aiModalUsername.innerText = '@' + username;
    aiModalAvatar.src = avatar;
    aiModalStatus.innerText = 'Extraindo dados do Instagram...';
    aiModalResult.innerHTML = '<div class="spinner" style="width: 24px; height: 24px; border-width: 2px; margin: 20px auto;"></div>';

    try {
        await api.init(); 

        const userInfo = await api.getUserInfo(userId);
        if (!userInfo) throw new Error('Perfil restrito ou privado. O Instagram bloqueou a leitura da biografia.');
        
        aiModalStatus.innerText = 'Lendo postagens recentes...';
        const feed = await api.getUserFeed(userId);
        
        let bio = userInfo.biography || 'Sem biografia.';
        let postsText = feed.map(item => item.caption?.text || '').filter(t => t.trim() !== '').slice(0, 5).join('\n---\n');

        aiModalStatus.innerText = 'Buscando motores de IA disponíveis...';
        const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const modelsData = await modelsRes.json();
        
        if (modelsData.error) throw new Error('Erro na chave API: ' + modelsData.error.message);
        
        const validModels = (modelsData.models || []).filter(m => 
            m.supportedGenerationMethods && 
            m.supportedGenerationMethods.includes('generateContent') && 
            m.name.includes('gemini')
        );
        
        if (validModels.length === 0) throw new Error('Nenhum modelo Gemini compatível encontrado na sua conta do Google AI Studio.');
        
        let selectedModel = validModels.find(m => m.name.includes('flash')) || validModels[0];
        const modelName = selectedModel.name;

        aiModalStatus.innerText = `Enviando para o Cérebro IA (${modelName.replace('models/', '')})...`;

        const prompt = `ATENÇÃO: Você é um analista investigativo privado de perfis do Instagram. Seu objetivo é ser BRUTALMENTE HONESTO, DIRETO e EXATO na sua leitura do perfil. A precisão é sua prioridade absoluta. Nunca invente informações ou assuma papéis sociais (como ser pai/mãe) sem evidências concretas no texto ou na foto.

Seu trabalho é analisar a foto de perfil (se fornecida junto com este prompt), ler a biografia, nome de usuário (@${username}), nome completo (${userInfo.full_name || 'Desconhecido'}) e as últimas postagens, para deduzir EXATAMENTE quem é essa pessoa na vida real. Pense com calma.

REGRAS DE CLASSIFICAÇÃO ABSOLUTAS:
1. FOCO TOTAL NO GÊNERO E EVIDÊNCIAS VISUAIS/TEXTUAIS: Analise a foto de perfil cuidadosamente para definir o gênero, aparência e faixa etária. Preste atenção também ao nome e pronomes nos textos. NUNCA confunda o gênero da pessoa.
2. PROIBIDO USAR FILTROS OU SER POLIDO: Continue usando linguagem descritiva, crua e de rua. Se a foto e os textos mostram um cara focado em academia, chame de "Marombeiro Básico". Se for uma mulher exibindo muito o corpo, use "Gostosa", "Patricinha" ou "Biscoiteira". Fale a verdade nua e crua. Não seja genérico.
3. PASSO A PASSO DA RESPOSTA OBRIGATÓRIO:
Sua resposta DEVE seguir este exato formato, com a tag na primeira linha:
[A TAG PRINCIPAL] (ex: [Playboy de Academia], [Cara Normal Sem Graça], [Militante Chato], [Universitária Festeira])
- Gênero/Idade Visual/Tipo: (Ex: Homem ~25 anos, Mulher ~30 anos, ou Página)
- Análise de Evidências: (Explique em 1-2 frases o que a foto de perfil mostra fisicamente e o que os textos dizem que embasam sua conclusão).
- Resumo Final: (1-2 frases com a sua conclusão final, fria, sincera e sem filtro).

Dados do Perfil:
Nome de Usuário: @${username}
Nome Completo: ${userInfo.full_name || 'Não informado'}
Biografia do Perfil:
"${bio}"

Últimas Legendas de Posts:
"${postsText}"`;

        aiModalStatus.innerText = `Lendo foto de perfil e enviando para IA (${modelName.replace('models/', '')})...`;

        let base64Image = null;
        try {
            const res = await fetch(avatar);
            const blob = await res.blob();
            base64Image = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
        } catch(e) {
            console.warn('Não foi possível ler a foto de perfil para a IA', e);
        }

        let aiParts = [{ text: prompt }];
        if (base64Image) {
             aiParts.push({
                 inlineData: {
                     mimeType: "image/jpeg",
                     data: base64Image
                 }
             });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: aiParts }],
                generationConfig: { temperature: 0.3 },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error('Erro na IA: ' + data.error.message);

        const candidate = data.candidates[0];
        let aiText = candidate.content ? candidate.content.parts[0].text : '';
        
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            aiText += `\n\n[Corte na transmissão detectado. Motivo da IA: ${candidate.finishReason}]`;
        }

        aiModalStatus.innerText = 'Análise concluída com sucesso.';
        aiModalResult.innerText = aiText;
        
    } catch (err) {
        aiModalStatus.innerText = 'Operação abortada.';
        aiModalResult.innerHTML = `<span style="color: var(--pastel-red-text);">${err.message}</span>`;
    }
}
