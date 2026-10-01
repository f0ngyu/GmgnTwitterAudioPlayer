const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const api = require('../lib/debot-signal');
function setup() {
    const played = [], submitted = [], completed = [], retried = [];
    const context = { GmgnDebotSignal: api, isCacheReady: true,
        configCache: { isMasterEnabled: true, enableAiSignal: true, aiSignalSettings: {} },
        isCurrentPlatformEnabled: () => true, getPagePlatform: () => 'debot', canSubmitMonitorEvents: () => true,
        submitMonitorEvent: (...args) => submitted.push(args), markCoordinatorEventScheduled: () => {},
        notifyCoordinatorComplete: ids => completed.push(...ids), requestCoordinatorRetry: ids => retried.push(...ids),
        diagnosticLog: () => {}, window: { addEventListener: () => {} },
        DynamicPlaybackScheduler: { _isPlaying: false, _startSafetyTimer: () => {}, releaseAndNext() { this._isPlaying = false; } },
        playNetworkTTS: (text, source, done) => played.push({ text, source, done }) };
    vm.createContext(context);
    const source = fs.readFileSync(require.resolve('../content.js'), 'utf8').split('const aiSignalQueue = [];')[1];
    vm.runInContext('const aiSignalQueue = [];'+source, context);
    return { context, played, submitted, completed, retried };
}
const item = { id: 'one', chain: 'bsc', symbol: 'TEST', walletCount: 3, createdAt: Date.now() };
test('signal ingestion uses background coordination and independent identity', () => {
    const { context, submitted, played } = setup();
    context.handleAiSignal({ detail: item });
    assert.equal(submitted[0][0], 'signal');
    assert.equal(submitted[0][1], 'debot_signal_bsc_one');
    assert.equal(played.length, 0);
});
test('coordinated signal uses shared speech lock and completes after audio', () => {
    const { context, played, completed } = setup();
    context.handleAiSignal({ detail: item, __gmgnCoordinated: true, __gmgnEventId: 'event' });
    assert.equal(context.DynamicPlaybackScheduler._activeKind, 'signal');
    assert.equal(played[0].source, 'wallet');
    assert.match(played[0].text, /BSC，TEST，3个聪明钱包/);
    assert.equal(completed.length, 0);
    played[0].done();
    assert.deepEqual(completed, ['event']);
});
test('busy speech queues signal, then rechecks changed chain filter before playback', () => {
    const { context, played, completed } = setup();
    context.DynamicPlaybackScheduler._isPlaying = true;
    context.handleAiSignal({ detail: item, __gmgnCoordinated: true, __gmgnEventId: 'event' });
    assert.equal(played.length, 0);
    context.configCache.aiSignalSettings = { chains: 'sol' };
    context.startNextAiSignal();
    assert.equal(played.length, 0);
    assert.deepEqual(completed, ['event']);
});
test('disabled signal does not submit; playback failure requests retry', () => {
    const { context, played, submitted, retried } = setup();
    context.configCache.enableAiSignal = false;
    context.handleAiSignal({ detail: item });
    assert.equal(submitted.length, 0);
    context.configCache.enableAiSignal = true;
    context.handleAiSignal({ detail: item, __gmgnCoordinated: true, __gmgnEventId: 'event' });
    played[0].done({ ok: false, error: 'offline' });
    assert.deepEqual(retried, ['event']);
});
