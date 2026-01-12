// AO Runtime for HyperBEAM JavaScript smart contracts
var _outbox = [];
globalThis.state = {};
globalThis.msg = {};
globalThis.env = {};
globalThis._getOutbox = function() { return JSON.stringify(_outbox); };
globalThis._clearOutbox = function() { _outbox.length = 0; };

globalThis.Handlers = {
    _h: {},
    add: function(n, f) { this._h[n] = f; },
    remove: function(n) { delete this._h[n]; },
    list: function() { return Object.keys(this._h); },
    handle: function(m) {
        var h = this._h[m.Action || m.action] || this._h['default'];
        return h ? h(m) : { error: 'No handler: ' + (m.Action || m.action) };
    }
};

globalThis.ao = {
    send: function(m) { if (m && m.Target) _outbox.push(JSON.parse(JSON.stringify(m))); },
    log: function() {}
};
