const test = require('node:test');
const assert = require('node:assert/strict');
const { createController, channelIds } = require('../lib/debot-signal-subscription');
function setup() {
    const workers = [], received = [];
    const controller = createController((url, options) => {
        const messages = [], listeners = [];
        const worker = { url, options, messages, listeners, port: {
            postMessage: message => messages.push(message), start() {}, close() { worker.closed = true; },
            addEventListener: (type, callback) => listeners.push(callback)
        } };
        workers.push(worker);
        return worker;
    }, message => received.push(message));
    const config = { ready: true, roleKnown: true, isProcessor: true, master: true, debot: true, aiSignal: true, aiSignalChains: 'sol,bsc' };
    const attach = { type: 'attach', sessionKey: 'session', portalUrl: 'portal', bid: 'test' };
    return { controller, workers, received, config, attach };
}
test('all-chain selection uses public channel map and normalizes aliases', () => {
    assert.equal(channelIds('').length, 11);
    assert.deepEqual(channelIds('Solana,bsc,ethereum,base,sol,unknown'), ['1', '2', '81', '24']);
});
test('independent port survives website subscription cleanup without duplicating references', () => {
    const { controller, workers, received, config, attach } = setup();
    controller.configure(config);
    assert.equal(workers.length, 0);
    controller.observe(attach, 'worker.js', { name: 'portal-ws-shared', type: 'module' });
    const worker = workers[0];
    assert.deepEqual(worker.messages.map(message => message.type), ['attach', 'listen', 'subscribe']);
    assert.deepEqual(worker.messages[2].topicArgs, [['community-signal-channel:1'], ['community-signal-channel:2']]);
    controller.observe({ type: 'unlisten', kind: 'portal' });
    controller.observe({ type: 'unsubscribe', kind: 'portal' });
    controller.configure(config);
    assert.equal(worker.messages.length, 3);
    worker.listeners[0]({ data: { type: 'socket-event' } });
    assert.equal(received.length, 1);
});
test('chain changes diff subscriptions; disable and processor handoff release the port', () => {
    const { controller, workers, config, attach } = setup();
    controller.observe(attach, 'worker.js');
    controller.configure(config);
    controller.configure({ ...config, aiSignalChains: 'bsc,eth' });
    assert.equal(workers[0].messages[3].type, 'unsubscribe');
    assert.deepEqual(workers[0].messages[3].args, ['community-signal-channel:1']);
    assert.deepEqual(workers[0].messages[4].args, ['community-signal-channel:81']);
    controller.configure({ ...config, aiSignal: false });
    assert.equal(workers[0].messages.at(-1).type, 'detach');
    assert.equal(workers[0].closed, true);
    controller.configure(config);
    assert.equal(workers.length, 2);
    controller.configure({ ...config, isProcessor: false });
    assert.equal(workers[1].closed, true);
});
test('session change, logout and pagehide release subscription references', () => {
    const { controller, workers, config, attach } = setup();
    controller.configure(config);
    controller.observe(attach, 'worker.js');
    controller.observe({ ...attach, sessionKey: 'new-session' }, 'worker.js');
    assert.equal(workers[0].closed, true);
    assert.equal(workers[1].messages[0].sessionKey, 'new-session');
    controller.observe({ type: 'detach' });
    controller.configure(config);
    assert.equal(workers.length, 2);
    controller.observe(attach, 'worker.js');
    controller.stop();
    assert.equal(workers[2].closed, true);
});
