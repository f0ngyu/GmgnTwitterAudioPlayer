const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMessage, allowed, speech, EVENT } = require('../lib/debot-signal');
const now = Date.now();
function message(chain = 'bsc', id = 'signal-1') {
    return { type: 'socket-event', kind: 'portal', event: EVENT, args: [{ data: JSON.stringify({
        results: [{ id, chain, token: 'token', create_time: Math.floor(now / 1000), channel_id: 1,
            avg_wallet_volume: '336.48', wallet_stats: [{}, {}, {}] }],
        meta: { tokens: { token: { symbol: 'Pepa' } } }
    }) }] };
}
test('multi-chain worker notifications preserve independent signal identities', () => {
    for (const [chain, expected] of [['bsc','bsc'], ['solana','sol'], ['ethereum','eth'], ['base','base'], ['xlayer','xlayer']]) {
        const item = normalizeMessage(message(chain))[0];
        assert.equal(item.chain, expected);
        assert.equal(item.walletCount, 3);
        assert.equal(item.averageAmount, 336.48);
        assert.equal(item.symbol, 'Pepa');
        assert.equal(allowed(item, {}, now), true);
        assert.match(speech(item), /3个聪明钱包同时买入/);
    }
});
test('direct socket fallback and namespaced frames match worker notifications', () => {
    const msg = message();
    for (const prefix of ['42', '421', '42/portal,1']) {
        assert.deepEqual(normalizeMessage(prefix + JSON.stringify([EVENT, ...msg.args])), normalizeMessage(msg));
    }
});
test('history, price updates, main socket and malformed payloads never announce', () => {
    assert.deepEqual(normalizeMessage({ ...message(), event: 'community-signal-channel' }), []);
    assert.deepEqual(normalizeMessage({ ...message(), kind: 'main' }), []);
    assert.deepEqual(normalizeMessage({ ...message(), args: [{ data: '{' }] }), []);
    assert.deepEqual(normalizeMessage({ results: [] }), []);
    const item = normalizeMessage(message())[0];
    assert.equal(allowed({ ...item, createdAt: now - 120001 }, {}, now), false);
    assert.equal(allowed({ ...item, createdAt: now + 30001 }, {}, now), false);
});
test('chain aliases, all-chain default and minimum wallet filtering', () => {
    const item = normalizeMessage(message('solana'))[0];
    assert.equal(allowed(item, { chains: 'bsc,solana', minWallets: 3 }, now), true);
    assert.equal(allowed(item, { chains: 'bsc' }, now), false);
    assert.equal(allowed(item, { minWallets: 4 }, now), false);
});
