// aojs/aojs-modules/counter.js
state.count = state.count || 0;

Handlers.add('Increment', function(msg) {
    state.count = state.count + 1;
    return { count: state.count };
});

Handlers.add('Decrement', function(msg) {
    state.count = state.count - 1;
    return { count: state.count };
});

Handlers.add('GetCount', function(msg) {
    return { count: state.count };
});

Handlers.add('Reset', function(msg) {
    state.count = 0;
    return { count: 0 };
});
