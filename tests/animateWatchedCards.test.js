const animate = require('../src/routes/Discover/animateWatchedCards');
const make = () => {
    const nodes = [true, false, undefined].map((watched, index) => ({
        dataset: { watched: String(watched) }, hidden: false, inert: false,
        setAttribute: jest.fn(), removeAttribute: jest.fn(),
        getBoundingClientRect: () => ({ left: 0, top: nodes.slice(0, index).filter((node) => !node.hidden).length * 100 }),
        animate: jest.fn(() => ({ finished: Promise.resolve(), cancel: jest.fn() })),
    }));
    return { nodes, container: { querySelectorAll: () => nodes } };
};

test('only known watched cards hide, preserve nodes/order and restore with reflow and entrance animations', async () => {
    const { nodes, container } = make();
    const activeRef = { current: false };
    await animate(container, true, { activeRef }).finished;
    expect(nodes.map((node) => node.hidden)).toEqual([true, false, false]);
    expect(nodes[0].inert).toBe(true);
    expect(nodes[1].animate.mock.calls[0][0][0].transform).toBe('translate(0px, 100px)');
    expect(activeRef.current).toBe(false);
    await animate(container, false).finished;
    expect(nodes.map((node) => node.hidden)).toEqual([false, false, false]);
    expect(nodes[0].inert).toBe(false);
    expect(nodes[0].animate.mock.calls.at(-1)[0][0]).toEqual({ transform: 'scale(0.78)', opacity: 0 });
});

test('reduced motion has immediate correct visibility with zero animation calls', async () => {
    const { nodes, container } = make();
    await animate(container, true, { reducedMotion: true }).finished;
    expect(nodes[0].hidden).toBe(true);
    expect(nodes.every((node) => node.animate.mock.calls.length === 0)).toBe(true);
});

test('rapid reversal cancels stale completion before it can hide cards', async () => {
    const { nodes, container } = make();
    const first = animate(container, true);
    first.cancel();
    await animate(container, false).finished;
    await first.finished;
    expect(nodes.every((node) => !node.hidden && !node.inert)).toBe(true);
});
