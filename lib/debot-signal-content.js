// Isolated-world entry uses a distinct URL from the MAIN-world parser.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.GmgnDebotSignal = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
    'use strict';
    const EVENT = 'community-signal-channel-new-notification';
    function chain(value) {
        const name = String(value || '').trim().toLowerCase();
        return ({ solana: 'sol', ethereum: 'eth', binance: 'bsc' })[name] || name;
    }
    function parse(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch (error) { return null; }
    }
    function normalizeMessage(input) {
        let message = input;
        if (typeof input === 'string') {
            const match = input.match(/^42(?:\/[^,]+,)?\d*(\[.*)$/s);
            const args = match && parse(match[1]);
            if (!Array.isArray(args)) return [];
            message = { type: 'socket-event', kind: 'portal', event: args[0], args: args.slice(1) };
        }
        if (!message || message.type !== 'socket-event' || message.kind !== 'portal' || message.event !== EVENT) return [];
        const envelope = message.args && message.args[0];
        const payload = parse(envelope && envelope.data);
        if (!payload || !Array.isArray(payload.results)) return [];
        const meta = payload.meta || {};
        return payload.results.flatMap(item => {
            if (!item || !item.id || !item.chain || !item.token) return [];
            const token = (meta.tokens || {})[item.token] || {};
            const symbol = String(token.symbol || item.symbol || '').trim();
            const time = Number(item.create_time);
            if (!symbol || !Number.isFinite(time) || time <= 0) return [];
            const wallets = Array.isArray(item.wallet_stats) ? item.wallet_stats.length : 0;
            return [{
                id: String(item.id), chain: chain(item.chain), token: String(item.token),
                symbol: symbol.slice(0, 80), walletCount: wallets,
                createdAt: time > 1e12 ? time : time * 1000,
                averageAmount: Number(item.avg_wallet_volume) || 0,
                channelId: String(item.channel_id || '')
            }];
        });
    }
    function allowed(item, settings = {}, now = Date.now()) {
        if (!item || !item.id || !item.symbol || !item.chain) return false;
        const age = now - Number(item.createdAt);
        if (!Number.isFinite(age) || age > 120000 || age < -30000) return false;
        const chains = String(settings.chains || '').split(/[\s,，]+/).map(chain).filter(Boolean);
        return (!chains.length || chains.includes(chain(item.chain)))
            && item.walletCount >= (Number(settings.minWallets) || 0);
    }
    function speech(item) {
        const label = ({ sol: 'Solana', bsc: 'BSC', eth: 'Ethereum', base: 'Base' })[item.chain] || item.chain;
        return `${label}，${item.symbol}，${item.walletCount ? item.walletCount + '个聪明钱包同时买入' : '新AI信号'}`;
    }
    return { EVENT, normalizeMessage, allowed, speech };
});
