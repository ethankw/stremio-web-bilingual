// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

// Animate only card nodes. Catalog objects, links and core state stay untouched.
module.exports = (container, hideWatched, { duration = 260, easing = 'cubic-bezier(0.22, 1, 0.36, 1)', reducedMotion = false, initialRects, activeRef } = {}) => {
    const nodes = Array.from(container.querySelectorAll('[data-discover-card]'));
    const before = initialRects || new Map(nodes.filter((node) => !node.hidden).map((node) => [node, node.getBoundingClientRect()]));
    const animations = [];
    let cancelled = false;
    if (activeRef) activeRef.current = true;
    const shouldHide = (node) => hideWatched && node.dataset.watched === 'true';
    const setVisibility = (node, hidden) => {
        node.hidden = hidden;
        node.inert = hidden;
        if (hidden) node.setAttribute('aria-hidden', 'true');
        else node.removeAttribute('aria-hidden');
    };
    const animate = (node, frames, milliseconds = duration) => {
        if (reducedMotion || typeof node.animate !== 'function') return Promise.resolve();
        const animation = node.animate(frames, { duration: milliseconds, easing });
        animations.push(animation);
        return animation.finished.catch(() => undefined);
    };
    const finish = () => { if (!cancelled && activeRef) activeRef.current = false; };
    const reflow = () => {
        if (cancelled) return;
        nodes.forEach((node) => setVisibility(node, shouldHide(node)));
        const movements = nodes.filter((node) => !node.hidden).map((node) => {
            const previous = before.get(node);
            const next = node.getBoundingClientRect();
            if (previous && previous.left === next.left && previous.top === next.top) return Promise.resolve();
            return animate(node, previous ? [
                { transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px)`, opacity: 1 },
                { transform: 'translate(0, 0)', opacity: 1 },
            ] : [
                { transform: 'scale(0.78)', opacity: 0 },
                { transform: 'scale(1)', opacity: 1 },
            ]);
        });
        return Promise.all(movements).then(finish);
    };
    const exits = nodes.filter((node) => !node.hidden && shouldHide(node)).map((node) => {
        node.inert = true;
        node.setAttribute('aria-hidden', 'true');
        return animate(node, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.78)', opacity: 0 }], duration * 0.6);
    });
    const finished = reducedMotion ? (reflow(), Promise.resolve()) : Promise.all(exits).then(reflow);
    return {
        finished,
        cancel: () => {
            cancelled = true;
            animations.forEach((animation) => animation.cancel());
            if (activeRef) activeRef.current = false;
        },
    };
};
