class InstagramAPI {
    constructor() {
        // App ID padrão do Instagram Web
        this.appId = '936619743392459';
        this.userId = null;
        this.csrfToken = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            if (!chrome || !chrome.cookies) {
                return reject(new Error("Permissão de cookies não encontrada."));
            }

            chrome.cookies.get({ url: 'https://www.instagram.com', name: 'ds_user_id' }, (cookie) => {
                if (cookie) {
                    this.userId = cookie.value;
                    
                    chrome.cookies.get({ url: 'https://www.instagram.com', name: 'csrftoken' }, (csrfCookie) => {
                        this.csrfToken = csrfCookie ? csrfCookie.value : '';
                        resolve(true);
                    });
                } else {
                    reject(new Error("Usuário não está logado no Instagram. Faça login no navegador primeiro."));
                }
            });
        });
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchList(type, progressCallback) {
        let items = [];
        let maxId = '';
        let hasNext = true;

        while (hasNext) {
            let url = `https://www.instagram.com/api/v1/friendships/${this.userId}/${type}/?count=50`;
            if (maxId) {
                url += `&max_id=${maxId}`;
            }

            try {
                const response = await fetch(url, {
                    headers: {
                        'X-IG-App-ID': this.appId,
                        'X-CSRFToken': this.csrfToken,
                        'Accept': '*/*'
                    },
                });

                if (response.status === 429) {
                    progressCallback(`Bloqueio temporário (429). Pausando por 60 segundos...`, items.length);
                    await this.sleep(60000);
                    continue; // Tenta a mesma página novamente
                }

                if (!response.ok) {
                    throw new Error(`Erro da API: ${response.status}`);
                }

                const data = await response.json();
                
                const users = data.users || [];
                items = items.concat(users.map(u => ({
                    id: String(u.pk),
                    username: u.username,
                    full_name: u.full_name,
                    profile_pic_url: u.profile_pic_url
                })));

                hasNext = data.next_max_id ? true : false;
                maxId = data.next_max_id;

                const label = type === 'followers' ? 'seguidores' : 'seguindo';
                progressCallback(`Extraindo ${label}... (${items.length})`, items.length);

                if (hasNext) {
                    // Delay longo para evitar banimentos (entre 3 e 6 segundos)
                    const delay = Math.floor(Math.random() * 3000) + 3000;
                    progressCallback(`Pausa de segurança (${(delay/1000).toFixed(1)}s)...`, items.length);
                    await this.sleep(delay);
                }

            } catch (error) {
                console.error(`Erro ao buscar ${type}:`, error);
                throw error;
            }
        }

        return items;
    }

    async getFollowers(progressCb) {
        return this.fetchList('followers', progressCb);
    }

    async getFollowing(progressCb) {
        return this.fetchList('following', progressCb);
    }

    async doAction(endpoint, userId) {
        const url = `https://www.instagram.com/api/v1/friendships/${endpoint}/${userId}/`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-IG-App-ID': this.appId,
                    'X-CSRFToken': this.csrfToken,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('RATE_LIMIT');
                }
                throw new Error(`Erro API: ${response.status}`);
            }
            
            const data = await response.json();
            return data.status === 'ok';
        } catch (error) {
            console.error(`Falha ao executar ${endpoint} para ${userId}:`, error);
            throw error;
        }
    }

    async unfollow(userId) {
        return this.doAction('destroy', userId);
    }

    async follow(userId) {
        return this.doAction('create', userId);
    }

    async removeFollower(userId) {
        return this.doAction('remove_follower', userId);
    }

    async getUserInfo(userId) {
        const url = `https://www.instagram.com/api/v1/users/${userId}/info/`;
        try {
            const response = await fetch(url, {
                headers: {
                    'X-IG-App-ID': this.appId,
                    'X-CSRFToken': this.csrfToken,
                }
            });
            if (!response.ok) throw new Error('Falha ao buscar info do usuário');
            const data = await response.json();
            return data.user;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    async getUserFeed(userId) {
        const url = `https://www.instagram.com/api/v1/feed/user/${userId}/?count=5`;
        try {
            const response = await fetch(url, {
                headers: {
                    'X-IG-App-ID': this.appId,
                    'X-CSRFToken': this.csrfToken,
                }
            });
            if (!response.ok) throw new Error('Falha ao buscar feed');
            const data = await response.json();
            return data.items || [];
        } catch (e) {
            console.error(e);
            return [];
        }
    }
}
