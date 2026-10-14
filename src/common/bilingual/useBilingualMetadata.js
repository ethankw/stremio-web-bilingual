// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const React = require('react');
const { getBilingualClient, getRequestKey, normalizeIdentity } = require('./client');
const { useBilingualSettings } = require('./settings');

const useBilingualMetadata = (identity, options = {}) => {
    const { settings } = useBilingualSettings();
    const identityInput = React.useMemo(() => ({
        type: identity?.type,
        stremioType: identity?.stremioType,
        id: identity?.id,
        stremioId: identity?.stremioId,
        scope: identity?.scope,
        season: identity?.season,
        episode: identity?.episode,
    }), [identity?.type, identity?.stremioType, identity?.id, identity?.stremioId, identity?.scope, identity?.season, identity?.episode]);
    const normalizedIdentity = React.useMemo(() => normalizeIdentity(identityInput), [identityInput]);
    const identityKey = normalizedIdentity.valid ? getRequestKey(normalizedIdentity) : 'unsupported';
    const lazy = options.lazy === true;
    const priority = Number.isFinite(options.priority) ? options.priority : 1;
    const enabled = settings.enabled && normalizedIdentity.valid;
    const [resultState, setResultState] = React.useState({ key: identityKey, metadata: null, status: 'idle' });
    const subscriptionRef = React.useRef(null);
    const subscriptionKeyRef = React.useRef(null);
    const observerRef = React.useRef(null);
    const visibleKeyRef = React.useRef(null);
    const currentIdentityKeyRef = React.useRef(identityKey);
    currentIdentityKeyRef.current = identityKey;

    React.useEffect(() => {
        if (!enabled) {
            setResultState({ key: identityKey, metadata: null, status: 'idle' });
            return undefined;
        }

        const subscription = getBilingualClient().subscribe(normalizedIdentity, {
            priority,
            autoStart: false,
            onChange: (nextResult) => setResultState({ key: identityKey, ...nextResult }),
        });
        subscriptionRef.current = subscription;
        subscriptionKeyRef.current = identityKey;

        if (!lazy || typeof IntersectionObserver !== 'function' || visibleKeyRef.current === identityKey) {
            subscription.start();
        }

        return () => {
            subscription.cancel();
            if (subscriptionRef.current === subscription) {
                subscriptionRef.current = null;
            }
            if (subscriptionKeyRef.current === identityKey) {
                subscriptionKeyRef.current = null;
            }
            if (visibleKeyRef.current === identityKey) {
                visibleKeyRef.current = null;
            }
        };
    }, [enabled, identityKey, lazy, priority, normalizedIdentity]);

    const ref = React.useCallback((node) => {
        if (observerRef.current !== null) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        if (!node || !enabled || !lazy || identityKey === 'unsupported' || typeof IntersectionObserver !== 'function') {
            if (visibleKeyRef.current === identityKey) {
                visibleKeyRef.current = null;
            }
            return;
        }

        visibleKeyRef.current = null;
        const observer = new IntersectionObserver((entries) => {
            if (currentIdentityKeyRef.current !== identityKey) {
                return;
            }

            if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
                visibleKeyRef.current = identityKey;
                if (subscriptionKeyRef.current === identityKey && subscriptionRef.current !== null) {
                    subscriptionRef.current.start();
                }
                observer.disconnect();
                observerRef.current = null;
            }
        }, { rootMargin: '240px' });
        observerRef.current = observer;
        observer.observe(node);
    }, [enabled, identityKey, lazy]);

    React.useEffect(() => () => {
        if (observerRef.current !== null) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }
        if (visibleKeyRef.current === identityKey) {
            visibleKeyRef.current = null;
        }
    }, [identityKey]);

    const currentResult = enabled && resultState.key === identityKey ? resultState : { metadata: null, status: 'idle' };

    return {
        metadata: currentResult.metadata,
        status: currentResult.status,
        enabled,
        ref,
        settings,
    };
};

module.exports = useBilingualMetadata;
