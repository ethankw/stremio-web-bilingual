// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useTranslation } = require('react-i18next');
const { useLocation, useParams, useNavigate } = require('react-router');
const { useSearchParams } = require('react-router-dom');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const NotFound = require('stremio/routes/NotFound');
const { useProfile, useNotifications, useOnScrollToBottom, withCoreSuspender } = require('stremio/common');
const { default: toPath } = require('stremio-router/toPath');
const { DelayedRenderer, Chips, Image, MainNavBars, LibItem, MultiselectMenu } = require('stremio/components');
const { default: Placeholder } = require('./Placeholder');
const useLibrary = require('./useLibrary');
const useSelectableInputs = require('./useSelectableInputs');
const styles = require('./styles');
const watchedStyles = require('../Discover/styles');
const useSavedBoolean = require('stremio/common/useSavedBoolean');
const useAnimatedWatchedFilter = require('../Discover/useAnimatedWatchedFilter');
const { useRouteActive } = require('stremio/common/useRouteFocused');

const SCROLL_TO_BOTTOM_TRESHOLD = 400;

function withModel(Library) {
    const LibraryWithModel = () => {
        const location = useLocation();
        const model = React.useMemo(() => {
            return typeof location.pathname === 'string' ?
                location.pathname.match('/library') ?
                    'library'
                    :
                    location.pathname.match('/continuewatching') ?
                        'continue_watching'
                        :
                        null
                :
                null;
        }, [location?.pathname]);

        if (model === null) return <NotFound />;

        return <Library model={model} />;
    };
    LibraryWithModel.displayName = 'LibraryWithModel';
    return LibraryWithModel;
}

const Library = ({ model }) => {
    const { type } = useParams();
    const urlParams = React.useMemo(() => ({
        type
    }), [type]);
    const [queryParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const profile = useProfile();
    const routeActive = useRouteActive();
    const notifications = useNotifications();
    const [library, loadNextPage] = useLibrary(model, urlParams, queryParams);
    const [typeSelect, sortChips, hasNextPage] = useSelectableInputs(library);
    const [hideWatched, setHideWatched] = useSavedBoolean('stremio-library-hide-watched-v1');
    const emptyLabel = t(model === 'library' ? 'LIBRARY_EMPTY' : 'BOARD_CONTINUE_WATCHING_EMPTY');
    const scrollContainerRef = React.useRef(null);
    const watchedAnimationActive = useAnimatedWatchedFilter(scrollContainerRef, model === 'library' && hideWatched, library.catalog);
    const noVisibleItems = model === 'library' && hideWatched && library.catalog.length > 0 && library.catalog.every((item) => item.watched === true);
    const requestedHiddenPage = React.useRef(null);
    React.useEffect(() => {
        if (!routeActive || model !== 'library' || !hideWatched || !hasNextPage) {
            requestedHiddenPage.current = null;
            return undefined;
        }
        const pageKey = JSON.stringify([hasNextPage, library.catalog.length]);
        const timer = setTimeout(() => {
            const container = scrollContainerRef.current;
            if ((noVisibleItems || container && container.scrollHeight <= container.clientHeight + SCROLL_TO_BOTTOM_TRESHOLD) && requestedHiddenPage.current !== pageKey) {
                requestedHiddenPage.current = pageKey;
                loadNextPage();
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [routeActive, model, hideWatched, noVisibleItems, hasNextPage, library.catalog.length, loadNextPage]);
    const onScrollToBottom = React.useCallback(() => {
        if (hasNextPage && !watchedAnimationActive.current) {
            loadNextPage();
        }
    }, [hasNextPage, loadNextPage, watchedAnimationActive]);
    const onScroll = useOnScrollToBottom(onScrollToBottom, SCROLL_TO_BOTTOM_TRESHOLD);
    React.useLayoutEffect(() => {
        if (scrollContainerRef.current !== null && library.selected && library.selected.request.page === 1 && library.catalog.length !== 0) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [profile.auth, library.selected]);
    React.useEffect(() => {
        if (!library.selected?.type && typeSelect.value) {
            navigate(toPath(typeSelect.value));
        }
    }, [typeSelect.value, library.selected]);
    return (
        <MainNavBars className={styles['library-container']} route={model}>
            {
                profile.auth !== null ?
                    <div className={styles['library-content']}>
                        <div className={styles['selectable-inputs-container']}>
                            <MultiselectMenu {...typeSelect} className={styles['select-input-container']} />
                            <Chips {...sortChips} className={styles['select-input-container']} />
                        </div>
                        {model === 'library' && <div className={watchedStyles['watched-controls']}>
                            <button type={'button'} role={'switch'} aria-checked={hideWatched} className={watchedStyles['watched-switch']} onClick={() => setHideWatched((value) => !value)}>
                                <span className={watchedStyles['watched-switch-track']} aria-hidden={true}><span /></span>
                                {t('DISCOVER_HIDE_WATCHED', { defaultValue: '隐藏已观看' })}
                            </button>
                        </div>}
                        {
                            library.selected === null ?
                                <DelayedRenderer delay={500}>
                                    <div className={styles['message-container']}>
                                        <Image
                                            className={styles['image']}
                                            src={require('/assets/images/empty.png')}
                                            alt={' '}
                                        />
                                        <div className={styles['message-label']}>{model === 'library' ? t('LIBRARY_NOT_LOADED') : t('BOARD_CONTINUE_WATCHING_NOT_LOADED')}</div>
                                    </div>
                                </DelayedRenderer>
                                :
                                library.catalog.length === 0 ?
                                    <div className={styles['message-container']}>
                                        <Image
                                            className={styles['image']}
                                            src={require('/assets/images/empty.png')}
                                            alt={' '}
                                        />
                                        <div className={styles['message-label']}>{emptyLabel}</div>
                                    </div>
                                    :
                                    <div ref={scrollContainerRef} className={classnames(styles['meta-items-container'], 'animation-fade-in')} onScroll={onScroll}>
                                        {
                                            library.catalog.map((libItem) => (
                                                <div key={`${libItem.type}:${libItem._id}`} className={styles['library-card']} data-discover-card={true} data-watched={libItem.watched === true}>
                                                    <LibItem
                                                        {...libItem}
                                                        notifications={notifications}
                                                        removable={model === 'library'}
                                                        detailsVideosFirst={model === 'library'}
                                                    />
                                                </div>
                                            ))
                                        }
                                        {noVisibleItems && !hasNextPage && <div className={styles['watched-empty']}>{t('LIBRARY_EMPTY_UNWATCHED')}</div>}
                                    </div>
                        }
                    </div>
                    :
                    <Placeholder />
            }
        </MainNavBars>
    );
};

Library.propTypes = {
    model: PropTypes.oneOf(['library', 'continue_watching']),
};

const LibraryFallback = ({ model }) => (
    <MainNavBars className={styles['library-container']} route={model} />
);

LibraryFallback.propTypes = Library.propTypes;

module.exports = withModel(withCoreSuspender(Library, LibraryFallback));
