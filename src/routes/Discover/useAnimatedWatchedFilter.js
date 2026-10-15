// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const React = require('react');
const animateWatchedCards = require('./animateWatchedCards');

const useAnimatedWatchedFilter = (containerRef, hideWatched, catalog) => {
    const controller = React.useRef(null);
    const activeRef = React.useRef(false);
    React.useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const before = new Map(Array.from(container.querySelectorAll('[data-discover-card]'))
            .filter((node) => !node.hidden).map((node) => [node, node.getBoundingClientRect()]));
        controller.current?.cancel();
        const computed = window.getComputedStyle(container);
        controller.current = animateWatchedCards(container, hideWatched, {
            initialRects: before,
            duration: Number(computed.getPropertyValue('--watched-motion-duration').trim()) || 260,
            easing: computed.getPropertyValue('--watched-motion-easing').trim() || 'cubic-bezier(0.22, 1, 0.36, 1)',
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            activeRef,
        });
    }, [containerRef, hideWatched, catalog]);
    React.useEffect(() => () => controller.current?.cancel(), []);
    return activeRef;
};

module.exports = useAnimatedWatchedFilter;
