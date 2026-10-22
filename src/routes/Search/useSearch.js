// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useCore } = require('stremio/core');
const { useModelState } = require('stremio/common');
const { useRouteActive } = require('stremio/common/useRouteFocused');
const searchRanges = require('./searchRanges');

const useSearch = (queryParams) => {
    const core = useCore();
    const active = useRouteActive();
    const startedRef = React.useRef(null);
    // TODO: refactor this to be in stremio-core-web
    // React.useEffect(() => {
    //     let timerId = setTimeout(emitSearchEvent, 500);
    //     function emitSearchEvent() {
    //         timerId = null;
    //         const state = core.transport.getState('search');
    //         if (state.selected !== null) {
    //             const [, query] = state.selected.extra.find(([name]) => name === 'search');
    //             const responses = state.catalogs.filter((catalog) => catalog.content?.type === 'Ready');
    //             core.transport.analytics({
    //                 event: 'Search',
    //                 args: {
    //                     query,
    //                     responsesCount: responses.length
    //                 }
    //             });
    //         }
    //     }
    //     return () => {
    //         if (timerId !== null) {
    //             clearTimeout(timerId);
    //             emitSearchEvent();
    //         }
    //     };
    // }, [queryParams.get('search')]);
    const action = React.useMemo(() => {
        const query = queryParams.get('search') ?? queryParams.get('query');
        if (query?.length > 0) {
            return {
                action: 'Load',
                args: {
                    model: 'CatalogsWithExtra',
                    args: {
                        extra: [
                            ['search', query]
                        ]
                    }
                }
            };
        } else {
            return {
                action: 'Unload'
            };
        }
    }, [queryParams]);
    const loadRange = React.useCallback((range) => {
        core.transport.dispatch({
            action: 'CatalogsWithExtra',
            args: {
                action: 'LoadRange',
                args: range
            }
        }, 'search');
    }, []);
    const search = useModelState({ model: 'search', action });
    const query = queryParams.get('search') ?? queryParams.get('query');
    const selectedQuery = search.selected?.extra?.find(([name]) => name === 'search')?.[1];
    const catalogKey = JSON.stringify((search.catalogs || []).map((catalog) => [catalog.type, catalog.id, catalog.addon?.transportUrl]));
    React.useEffect(() => {
        if (!active || !query) { startedRef.current = null; return; }
        if (selectedQuery !== query) return;
        const key = `${query}|${catalogKey}`;
        if (startedRef.current === key) return;
        startedRef.current = key;
        // Start film and series searches together, including rows below the fold.
        // Core delivers each provider independently; no slowest-provider barrier.
        for (const range of searchRanges(JSON.parse(catalogKey).map(([type]) => ({ type })))) loadRange(range);
    }, [active, query, selectedQuery, catalogKey, loadRange]);
    return [search, loadRange];
};

module.exports = useSearch;
