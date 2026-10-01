(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.GmgnDebotSignalSubscription = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
    'use strict';
    // Debot's public useCommunitySocket channel map (frontend 2.2.200).
    const CHANNELS = { sol: '1', bsc: '2', eth: '81', base: '24', hyperevm: '82', monad: '80',
        robinhood: '83', stable: '84', xlayer: '33', arc: '85', pharos: '86' };
    const EVENT = 'community-signal-channel-new-notification';
    function channelIds(chains) {
        const requested = String(chains || '').split(/[\s,，]+/).filter(Boolean)
            .map(value => ({ solana: 'sol', ethereum: 'eth', binance: 'bsc' })[value.toLowerCase()] || value.toLowerCase());
        return [...new Set((requested.length ? requested : Object.keys(CHANNELS)).map(name => CHANNELS[name]).filter(Boolean))];
    }
    function createController(createWorker, receive) {
        let attachment = null, source = null, worker = null, enabled = false, selected = [], subscribed = [];
        function stop() {
            if (worker) {
                worker.port.postMessage({ type: 'detach' });
                worker.port.close();
            }
            worker = null;
            subscribed = [];
        }
        function sync() {
            if (!enabled || !attachment || !source || !selected.length) { stop(); return; }
            if (!worker) {
                worker = createWorker(source.url, source.options);
                worker.port.addEventListener('message', event => receive(event.data));
                worker.port.start();
                // Use a separate port: website unlisten/unsubscribe never removes our references.
                worker.port.postMessage(attachment);
                worker.port.postMessage({ type: 'listen', kind: 'portal', event: EVENT });
            }
            const send = (type, ids) => {
                if (!ids.length) return;
                const topics = ids.map(id => 'community-signal-channel:' + id);
                worker.port.postMessage({ type, kind: 'portal', event: 'subscribe', unsubscribeEvent: 'unsubscribe',
                    args: topics, topicArgs: topics.map(topic => [topic]), preserveTopicBatch: false });
            };
            send('unsubscribe', subscribed.filter(id => !selected.includes(id)));
            send('subscribe', selected.filter(id => !subscribed.includes(id)));
            subscribed = selected.slice();
        }
        return {
            configure(config) {
                enabled = config.ready === true && config.roleKnown === true && config.isProcessor === true
                    && config.master !== false && config.debot === true && config.aiSignal === true;
                selected = channelIds(config.aiSignalChains);
                sync();
            },
            observe(message, url, options) {
                if (!message || typeof message !== 'object') return;
                if (message.type === 'attach') {
                    if (attachment && attachment.sessionKey !== message.sessionKey) stop();
                    attachment = { ...message };
                    source = { url, options };
                    sync();
                } else if (message.type === 'detach') {
                    stop();
                    attachment = null;
                }
            },
            stop
        };
    }
    return { channelIds, createController };
});
