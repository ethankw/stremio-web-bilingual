// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const UrlUtils = require('url');
const { useCore } = require('stremio/core');
const { useModelState } = require('stremio/common');
const useAggregatedDiscover = require('./useAggregatedDiscover');

const map = (discover) => ({
    ...discover,
    catalog: discover.catalog !== null && discover.catalog.content.type === 'Ready' ?
        {
            ...discover.catalog,
            content: {
                ...discover.catalog.content,
                content: discover.catalog.content.content.map((metaItem) => ({
                    ...metaItem,
                    released: new Date(typeof metaItem.released === 'string' ? metaItem.released : NaN),
                }))
            }
        }
        :
        discover.catalog
});

const useDiscover = (urlParams, queryParams, filters) => {
    const core = useCore();
    const loadNextPage = React.useCallback(() => {
        core.transport.dispatch({
            action: 'CatalogWithFilters',
            args: {
                action: 'LoadNextPage'
            }
        }, 'discover');
    }, []);
    const aggregated = !urlParams.type || ['movie', 'series'].includes(urlParams.type);
    const action = React.useMemo(() => {
        if (aggregated) return null;
        if (typeof urlParams.transportUrl === 'string' && typeof urlParams.type === 'string' && typeof urlParams.catalogId === 'string') {
            const { hostname } = UrlUtils.parse(urlParams.transportUrl);
            if (typeof hostname === 'string' && hostname.length > 0) {
                return {
                    action: 'Load',
                    args: {
                        model: 'CatalogWithFiltersSelection',
                        args: {
                            request: {
                                base: urlParams.transportUrl,
                                path: {
                                    resource: 'catalog',
                                    type: urlParams.type,
                                    id: urlParams.catalogId,
                                    extra: Array.from(queryParams.entries())
                                }
                            }
                        }
                    }
                };
            }
        } else {
            return {
                action: 'Load',
                args: {
                    model: 'CatalogWithFiltersSelection',
                    args: null
                }
            };
        }

        return {
            action: 'Unload'
        };
    }, [urlParams, queryParams, aggregated]);
    const discover = useModelState({ model: 'discover', action, map, deps: ['ctx'] });
    const visible = useAggregatedDiscover(core, discover, urlParams, queryParams, filters);
    return [visible, visible.aggregate?.loadNextPage || loadNextPage];
};

module.exports = useDiscover;
