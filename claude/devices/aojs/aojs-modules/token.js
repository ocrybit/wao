// aojs/aojs-modules/token.js
state.balances = state.balances || {};
state.name = state.name || 'TestToken';
state.ticker = state.ticker || 'TST';
state.totalSupply = state.totalSupply || 0;

Handlers.add('Info', function(msg) {
    return {
        name: state.name,
        ticker: state.ticker,
        totalSupply: state.totalSupply
    };
});

Handlers.add('Balance', function(msg) {
    var target = (msg.Tags && msg.Tags.Target) || msg.From || 'unknown';
    return { balance: state.balances[target] || 0 };
});

Handlers.add('Mint', function(msg) {
    var qty = parseInt((msg.Tags && msg.Tags.Quantity) || '0');
    var recipient = msg.From || 'unknown';
    state.balances[recipient] = (state.balances[recipient] || 0) + qty;
    state.totalSupply = state.totalSupply + qty;
    return { success: true, balance: state.balances[recipient] };
});

Handlers.add('Transfer', function(msg) {
    var from = msg.From || 'unknown';
    var to = msg.Tags && msg.Tags.Recipient;
    var qty = parseInt((msg.Tags && msg.Tags.Quantity) || '0');

    if (!to || qty <= 0) {
        return { error: 'Invalid transfer' };
    }

    var fromBalance = state.balances[from] || 0;
    if (fromBalance < qty) {
        return { error: 'Insufficient balance' };
    }

    state.balances[from] = fromBalance - qty;
    state.balances[to] = (state.balances[to] || 0) + qty;

    // Send notification to recipient
    ao.send({
        Target: to,
        Action: 'Credit-Notice',
        Quantity: String(qty),
        Sender: from
    });

    return { success: true };
});
