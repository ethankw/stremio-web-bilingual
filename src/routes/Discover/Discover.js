// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useTranslation } = require('react-i18next');
const { useParams } = require('react-router');
const { useSearchParams } = require('react-router-dom');
const classnames = require('classnames');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { useCore } = require('stremio/core');
const { CONSTANTS, useBinaryState, useMediaQuery, useOnScrollToBottom, withCoreSuspender } = require('stremio/common');
const { epgDateKey, parseEpgDate } = require('stremio/common/EPG');
const screenSizes = require('stremio/common/screen-sizes.less');
const { default: getMetaDetailsHref } = require('stremio/common/getMetaDetailsHref');
const { useRouteActive } = require('stremio/common/useRouteFocused');
const { useNavigateWithOrigin } = require('stremio-router');
const { AddonDetailsModal, Button, DelayedRenderer, Image, MainNavBars, MetaItem, MetaPreview, ModalDialog, MultiselectMenu } = require('stremio/components');
const { default: MetaPreviewSheet } = require('stremio/components/MetaPreviewSheet');
const { default: EpgProgramModal } = require('stremio/components/EpgProgramModal');
const useDiscover = require('./useDiscover');
const useAnimatedWatchedFilter = require('./useAnimatedWatchedFilter');
const useSelectableInputs = require('./useSelectableInputs');
const { default: FiltersSheet } = require('./FiltersSheet');
const { default: Guide } = require('./Guide');
const { default: DaySelector } = require('./Guide/DaySelector');
const { default: useLiveTvGuide } = require('./useLiveTvGuide');
const styles = require('./styles');
const useDiscoverFilters = require('./useDiscoverFilters');
const useCountryFilter = require('./useCountryFilter');
const useSavedBoolean = require('stremio/common/useSavedBoolean');

const SCROLL_TO_BOTTOM_THRESHOLD = 400;

const Discover = () => {
    const { type, transportUrl, catalogId } = useParams();
    const urlParams = React.useMemo(() => ({
        type,
        transportUrl,
        catalogId
    }), [type, transportUrl, catalogId]);
    const [queryParams, setQueryParams] = useSearchParams();
    // the selected EPG date lives in the `epg_date` query param only -
    // it is stripped from the catalog extra passed to the discover model
    const epgDate = React.useMemo(() => {
        const date = queryParams.get('epg_date');
        return parseEpgDate(date) !== null ? date : null;
    }, [queryParams]);
    const catalogQueryParams = React.useMemo(() => {
        const params = new URLSearchParams(queryParams);
        params.delete('epg_date');
        return params;
    }, [queryParams]);
    const { t } = useTranslation();
    const core = useCore();
    const { navigateWithOrigin } = useNavigateWithOrigin();
    const routeActive = useRouteActive();
    const discoveryFilters = useDiscoverFilters(urlParams, catalogQueryParams);
    const [unfilteredDiscover, loadNextPage] = useDiscover(urlParams, catalogQueryParams, discoveryFilters);
    const countryItems = React.useMemo(() => unfilteredDiscover.catalog?.content.type === 'Ready' ? unfilteredDiscover.catalog.content.content : [], [unfilteredDiscover.catalog]);
    const countryFilter = useCountryFilter(countryItems, routeActive && !!unfilteredDiscover.aggregate);
    const discover = React.useMemo(() => unfilteredDiscover.aggregate && unfilteredDiscover.catalog?.content.type === 'Ready' ? {
        ...unfilteredDiscover,
        catalog: { ...unfilteredDiscover.catalog, content: { ...unfilteredDiscover.catalog.content, content: countryFilter.items } },
    } : unfilteredDiscover, [unfilteredDiscover, countryFilter.items]);
    const [selectInputs, hasNextPage] = useSelectableInputs(discover);
    const [filtersOpen, openFilters, closeFilters] = useBinaryState(false);
    const genreInput = selectInputs.find(({ id }) => id === 'extra:genre');
    const menuInputs = selectInputs.filter(({ id }) => id !== 'extra:genre');
    const selectedTypeOption = selectInputs[0].options.find(({ value }) => value === selectInputs[0].value);
    const selectedCatalogOption = selectInputs[1].options.find(({ value }) => value === selectInputs[1].value);
    const activeFilterCount = selectInputs.filter(({ active }) => active).length;
    const [addonModalOpen, openAddonModal, closeAddonModal] = useBinaryState(false);
    const [mobilePreviewOpen, openMobilePreview, closeMobilePreview] = useBinaryState(false);
    const [selectedMetaItemKey, setSelectedMetaItemKey] = React.useState(null);
    const loadedItems = React.useMemo(() => discover.catalog?.content.type === 'Ready' ? discover.catalog.content.content : [], [discover.catalog]);
    const itemKey = React.useCallback((item) => item ? JSON.stringify([item.type, item.id, item.aggregateSource || '']) : null, []);
    const selectedMetaItemIndex = selectedMetaItemKey === null ? 0 : loadedItems.findIndex((item) => itemKey(item) === selectedMetaItemKey);
    const setSelectedMetaItemIndex = React.useCallback((index) => setSelectedMetaItemKey(itemKey(loadedItems[index])), [loadedItems, itemKey]);
    const [hideWatched, setHideWatched] = useSavedBoolean('stremio-discover-hide-watched-v1');
    const suppressScrollUntil = React.useRef(0);
    const toggleHideWatched = React.useCallback(() => {
        suppressScrollUntil.current = Date.now() + 600;
        setHideWatched((hidden) => !hidden);
    }, [setHideWatched]);
    const isMobile = useMediaQuery(`(max-width: ${screenSizes.xsmall})`);

    const compactEpgDate = useMediaQuery(`(max-width: ${screenSizes.xsmall}) and (max-height: ${screenSizes['phone-landscape-size']}) and (orientation: landscape)`);

    const selectedMetaItem = React.useMemo(() => {
        return discover.catalog?.content.type === 'Ready' &&
            discover.catalog.content.content[selectedMetaItemIndex] || null;
    }, [discover.catalog, selectedMetaItemIndex]);

    const metasContainerRef = React.useRef();
    const watchedAnimationActive = useAnimatedWatchedFilter(metasContainerRef, hideWatched, discover.catalog);
    const allLoadedHidden = hideWatched && loadedItems.length > 0 && loadedItems.every((item) => item.watched === true);
    React.useEffect(() => {
        if (discover.catalog?.content.type !== 'Ready') return;
        const items = discover.catalog.content.content;
        if (selectedMetaItemIndex < 0 || (hideWatched && items[selectedMetaItemIndex]?.watched === true)) {
            setSelectedMetaItemIndex(items.findIndex((item) => !hideWatched || item.watched !== true));
        }
    }, [hideWatched, discover.catalog, selectedMetaItemIndex, setSelectedMetaItemIndex]);
    const metaPreviewRef = React.useRef();
    const previousCatalogSizeRef = React.useRef(0);

    const [selectedEpgProgram, setSelectedEpgProgram] = React.useState(null);
    const [epgPreviewOpen, openEpgPreview, closeEpgPreviewModal] = useBinaryState(false);
    const isEpgLayout = discover.selectable.catalogs.find(({ selected }) => selected)?.isEpgGuide === true;
    const guide = useLiveTvGuide(discover, epgDate, isEpgLayout);
    const onEpgDayChange = React.useCallback((day) => {
        const date = epgDateKey(day);
        setQueryParams((params) => {
            const nextParams = new URLSearchParams(params);
            nextParams.set('epg_date', date);
            return nextParams;
        }, { replace: true });
    }, [setQueryParams]);
    const onProgramSelect = React.useCallback((program, channel) => {
        setSelectedEpgProgram({ program, channel });
        openEpgPreview();
    }, [openEpgPreview]);

    React.useEffect(() => {
        if (!isEpgLayout && discover.catalog?.content.type === 'Loading' && metasContainerRef.current) {
            metasContainerRef.current.scrollTop = 0;
            previousCatalogSizeRef.current = 0;
        }
    }, [discover.catalog, isEpgLayout]);
    React.useEffect(() => {
        if (!isEpgLayout && discover.catalog?.content.type === 'Ready') {
            const catalogSize = discover.catalog.content.content.length;
            const hasNewItems = catalogSize > previousCatalogSizeRef.current;
            previousCatalogSizeRef.current = catalogSize;
            if (hideWatched || !hasNextPage || !hasNewItems || !metasContainerRef.current) {
                return;
            }

            const containerHeight = metasContainerRef.current.scrollHeight;
            const viewportHeight = metasContainerRef.current.clientHeight;
            if (containerHeight <= viewportHeight + SCROLL_TO_BOTTOM_THRESHOLD) {
                loadNextPage();
            }
        }
    }, [discover.catalog, isEpgLayout, hasNextPage, loadNextPage, hideWatched]);
    const addToLibrary = React.useCallback(() => {
        if (selectedMetaItem === null) {
            return;
        }

        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'AddToLibrary',
                args: selectedMetaItem
            }
        });
    }, [selectedMetaItem]);
    const removeFromLibrary = React.useCallback(() => {
        if (selectedMetaItem === null) {
            return;
        }

        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'RemoveFromLibrary',
                args: selectedMetaItem.id
            }
        });
    }, [selectedMetaItem]);
    const toggleWatched = React.useCallback(() => {
        if (selectedMetaItem === null) {
            return;
        }

        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'MetaItemMarkAsWatched',
                args: {
                    meta_item: selectedMetaItem,
                    is_watched: !selectedMetaItem.watched,
                }
            }
        });
    }, [selectedMetaItem]);
    const metaItemsOnFocusCapture = React.useCallback((event) => {
        if (event.target.dataset.index !== null && !isNaN(event.target.dataset.index)) {
            setSelectedMetaItemIndex(parseInt(event.target.dataset.index, 10));
        }
    }, [setSelectedMetaItemIndex]);
    const metaItemOnClick = React.useCallback((event) => {
        if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
        }

        const index = Number(event.currentTarget.dataset.index);
        if (!Number.isInteger(index) || index < 0 || index >= loadedItems.length) {
            return;
        }

        // A normal click only selects a preview, including the already selected card.
        event.preventDefault();
        setSelectedMetaItemIndex(index);
        if (isMobile) {
            openMobilePreview();
        } else {
            event.currentTarget.focus();
        }
    }, [isMobile, loadedItems.length, openMobilePreview, setSelectedMetaItemIndex]);
    const metaItemOnDoubleClick = React.useCallback((event) => {
        if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
        }

        const index = Number(event.currentTarget.dataset.index);
        const href = Number.isInteger(index) && index >= 0 ? getMetaDetailsHref(loadedItems[index]?.deepLinks) : null;
        event.preventDefault();
        if (typeof href === 'string') {
            navigateWithOrigin(href);
        }
    }, [loadedItems, navigateWithOrigin]);
    const onScrollToBottom = React.useCallback(() => {
        if (hasNextPage && !watchedAnimationActive.current && Date.now() >= suppressScrollUntil.current) {
            loadNextPage();
        }
    }, [hasNextPage, loadNextPage, watchedAnimationActive]);
    const onScroll = useOnScrollToBottom(onScrollToBottom, SCROLL_TO_BOTTOM_THRESHOLD);
    React.useEffect(() => {
        if (!isMobile) closeFilters();
        closeAddonModal();
        closeMobilePreview();
        setSelectedMetaItemKey(null);
        setSelectedEpgProgram(null);
    }, [discover.selected, isMobile, closeFilters, closeAddonModal, closeMobilePreview]);
    const renderEmptyState = () => (
        <DelayedRenderer delay={500}>
            <div className={styles['message-container']}>
                <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                <div className={styles['message-label']}>{t('NO_CATALOG_SELECTED')}</div>
            </div>
        </DelayedRenderer>
    );

    const renderErrorState = (msg) => (
        <div className={styles['message-container']}>
            <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
            <div className={styles['message-label']}>{msg}</div>
        </div>
    );

    const renderCatalogContent = () => {
        // in EPG mode the discover catalog is intentionally not loaded -
        // the guide feeds from the LiveTvGuide model instead
        if (isEpgLayout) {
            return (
                <Guide
                    {...guide}
                    onProgramSelect={onProgramSelect}
                />
            );
        }

        if (discover.catalog === null) return renderEmptyState();
        if (discover.catalog.content.type === 'Err') return renderErrorState(discover.catalog.content.content);

        if (discover.catalog.content.type === 'Loading') {
            return (
                <div ref={metasContainerRef} className={classnames(styles['meta-items-container'], 'animation-fade-in')}>
                    {Array(CONSTANTS.CATALOG_PAGE_SIZE).fill(null).map((_, index) => (
                        <div key={index} className={styles['meta-item-placeholder']}>
                            <div className={styles['poster-container']} />
                            <div className={styles['title-bar-container']}>
                                <div className={styles['title-label']} />
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        return (
            <div ref={metasContainerRef} className={classnames(styles['meta-items-container'], 'animation-fade-in')} onScroll={onScroll} onFocusCapture={metaItemsOnFocusCapture}>
                {discover.catalog.content.content.length === 0 && <div className={styles['watched-empty']} role={'status'}>{t('DISCOVER_NO_MOVIES', { defaultValue: 'No movies found.' })}</div>}
                {discover.catalog.content.content.map((metaItem, index) => (
                    <div key={itemKey(metaItem)} className={styles['watched-card']} data-discover-card={true} data-watched={metaItem.watched === true}>
                        <MetaItem
                            bilingualIdentity={{ type: metaItem.type, id: metaItem.id, scope: 'meta' }}
                            className={classnames({ 'selected': selectedMetaItemIndex === index })}
                            type={metaItem.type}
                            name={metaItem.name}
                            releaseInfo={metaItem.releaseInfo}
                            released={metaItem.released}
                            links={metaItem.links}
                            imdbRating={metaItem.imdbRating}
                            poster={metaItem.poster}
                            posterShape={metaItem.posterShape}
                            playname={selectedMetaItemIndex === index}
                            deepLinks={metaItem.deepLinks}
                            watched={metaItem.watched}
                            data-index={index}
                            onClick={metaItemOnClick}
                            onDoubleClick={metaItemOnDoubleClick}
                        />
                    </div>
                ))}
                {allLoadedHidden && <div className={styles['watched-empty']} role={'status'}>
                    {t('DISCOVER_ALL_LOADED_WATCHED', { defaultValue: 'All loaded items have been watched.' })}
                    {hasNextPage && <button type={'button'} onClick={loadNextPage}>{t('DISCOVER_LOAD_MORE', { defaultValue: 'Load more' })}</button>}
                </div>}
            </div>
        );
    };

    const metaPreviewProps = selectedMetaItem && {
        compact: true,
        bilingualIdentity: { type: selectedMetaItem.type, id: selectedMetaItem.id, scope: 'meta' },
        name: selectedMetaItem.name,
        logo: selectedMetaItem.logo,
        runtime: selectedMetaItem.runtime,
        releaseInfo: selectedMetaItem.releaseInfo,
        released: selectedMetaItem.released,
        description: selectedMetaItem.description,
        deepLinks: selectedMetaItem.deepLinks,
        trailerStreams: selectedMetaItem.trailerStreams,
        inLibrary: selectedMetaItem.inLibrary,
        toggleInLibrary: selectedMetaItem.inLibrary ? removeFromLibrary : addToLibrary,
        watched: selectedMetaItem.watched,
        toggleWatched,
        metaId: selectedMetaItem.id,
        like: selectedMetaItem.like,
    };

    const renderMetaPreview = () => {
        if (isEpgLayout) {
            return null;
        }

        if (selectedMetaItem !== null) {
            return <MetaPreview
                {...metaPreviewProps}
                className={styles['meta-preview-container']}
                ref={metaPreviewRef}
                background={selectedMetaItem.poster}
                links={selectedMetaItem.links}
            />;
        } else if (discover.catalog !== null && discover.catalog.content.type === 'Loading') {
            return <div className={styles['meta-preview-container']} />;
        }

        return null;
    };
    const renderEpgPreviewModal = () => {
        if (!isEpgLayout || selectedEpgProgram === null) {
            return null;
        }

        const { program, channel } = selectedEpgProgram;
        return (
            <EpgProgramModal
                program={program}
                now={guide.now}
                show={epgPreviewOpen}
                onCloseRequest={closeEpgPreviewModal}
                channelHref={getMetaDetailsHref(channel.deepLinks)}
            />
        );
    };

    React.useEffect(() => {
        if (!routeActive) {
            closeFilters();
            closeMobilePreview();
            setSelectedEpgProgram(null);
        }
    }, [routeActive, closeFilters, closeMobilePreview]);
    const pendingHrefRef = React.useRef(null);
    const onMobileShowClick = React.useCallback((event) => {
        event.preventDefault();
        pendingHrefRef.current = getMetaDetailsHref(selectedMetaItem && selectedMetaItem.deepLinks);
        closeMobilePreview();
    }, [selectedMetaItem, closeMobilePreview]);
    const onMobilePreviewExited = React.useCallback(() => {
        const href = pendingHrefRef.current;
        pendingHrefRef.current = null;
        if (typeof href === 'string') {
            navigateWithOrigin(href);
        }
    }, [navigateWithOrigin]);
    return (
        <MainNavBars className={styles['discover-container']} route={'discover'}>
            <div className={styles['discover-content']}>
                <div className={styles['catalog-container']}>
                    <div className={classnames(styles['selectable-inputs-container'], { [styles['epg-inputs']]: isEpgLayout })}>
                        {discover.aggregate ? <div className={styles['primary-filter-chips']}>
                            <div role={'group'} aria-label={t('TYPE')} className={styles['chip-group']}>
                                {['movie', 'series'].map((mediaType) => <button key={mediaType} type={'button'} className={styles['genre-chip']} data-media-type={mediaType}
                                    aria-pressed={discoveryFilters.types.includes(mediaType)}
                                    onClick={() => discoveryFilters.update({ types: discoveryFilters.types.includes(mediaType) ? discoveryFilters.types.filter((value) => value !== mediaType) : [...discoveryFilters.types, mediaType] })}>
                                    {t(`TYPE_${mediaType}`)}
                                </button>)}
                            </div>
                            <div role={'group'} aria-label={t('CATALOG')} className={styles['chip-group']}>
                                {['all', 'popular', 'latest'].map((kind) => <button key={kind} type={'button'} className={styles['genre-chip']} data-catalog-kind={kind}
                                    aria-pressed={discoveryFilters.kind === kind} onClick={() => discoveryFilters.update({ kind })}>
                                    {t(kind === 'all' ? 'TYPE_ALL' : kind === 'popular' ? 'DISCOVER_POPULAR' : 'DISCOVER_LATEST')}
                                </button>)}
                            </div>
                        </div> : isMobile ? <div className={styles['mobile-filters']}>
                            <div className={styles['catalog-summary']}>
                                <div className={styles['catalog-type']}>{selectedTypeOption?.label ?? t('SELECT_TYPE')}</div>
                                <div className={styles['catalog-name']} title={selectedCatalogOption?.label}>{selectedCatalogOption?.label ?? t('SELECT_CATALOG')}</div>
                            </div>
                            <Button
                                className={styles['mobile-filter-button']}
                                role={'button'}
                                aria-label={t('CATALOG_FILTERS')}
                                aria-haspopup={'dialog'}
                                aria-expanded={filtersOpen}
                                onClick={openFilters}
                            >
                                <Icon name={'filters'} />
                                <span>{t('FILTERS')}</span>
                                {activeFilterCount > 0 && <span className={styles['filter-count']}>{activeFilterCount}</span>}
                            </Button>
                        </div> : <div className={styles['selectable-inputs']}>
                            {menuInputs.map(({ title, options, value, onSelect }, index) => (
                                <MultiselectMenu
                                    key={index}
                                    className={styles['select-input']}
                                    title={title}
                                    options={options}
                                    value={value}
                                    onSelect={onSelect}
                                    portal={isEpgLayout}
                                />
                            ))}
                            <div className={styles['filter-container']}>
                                <Button className={styles['filter-button']} title={t('ALL_FILTERS')} onClick={openFilters}>
                                    <Icon className={styles['filter-icon']} name={'filters'} />
                                </Button>
                            </div>
                        </div>}
                        {
                            isEpgLayout && compactEpgDate ?
                                <DaySelector
                                    compact={true}
                                    selectedDate={guide.selectedDate}
                                    today={guide.today}
                                    onDayChange={onEpgDayChange}
                                />
                                :
                                null
                        }
                    </div>
                    {genreInput && <div className={styles['genre-chips']} role={'group'} aria-label={genreInput.label}>
                        {genreInput.options.map((option) => (
                            <button
                                key={option.value}
                                type={'button'}
                                className={styles['genre-chip']}
                                aria-pressed={option.value === genreInput.value}
                                onClick={() => genreInput.onSelect(option.value)}
                            >{option.label}</button>
                        ))}
                    </div>}
                    {!isEpgLayout && <div className={styles['watched-controls']}>
                        {discover.aggregate && <button type={'button'} role={'switch'} data-country-filter={true} aria-checked={countryFilter.enabled} className={styles['watched-switch']} onClick={countryFilter.toggle}>
                            <span className={styles['watched-switch-track']} aria-hidden={true}><span /></span>
                            {t('DISCOVER_HIDE_EAST_ASIAN_INDIAN')}
                        </button>}
                        <button type={'button'} role={'switch'} aria-checked={hideWatched} className={styles['watched-switch']} onClick={toggleHideWatched}>
                            <span className={styles['watched-switch-track']} aria-hidden={true}><span /></span>
                            {t('DISCOVER_HIDE_WATCHED', { defaultValue: '隐藏已观看' })}
                        </button>
                    </div>}
                    {
                        discover.catalog !== null && !discover.catalog.installed ?
                            <div className={styles['missing-addon-warning-container']}>
                                <div className={styles['warning-label']}>{t('ERR_ADDON_NOT_INSTALLED')}</div>
                                <Button className={styles['install-button']} title={t('INSTALL_ADDON')} onClick={openAddonModal}>
                                    <div className={styles['label']}>{t('ADDON_INSTALL')}</div>
                                </Button>
                            </div>
                            :
                            null
                    }
                    {
                        isEpgLayout && !compactEpgDate ?
                            <DaySelector
                                selectedDate={guide.selectedDate}
                                today={guide.today}
                                onDayChange={onEpgDayChange}
                            />
                            :
                            null
                    }
                    {renderCatalogContent()}
                </div>
                {renderMetaPreview()}
            </div>
            {renderEpgPreviewModal()}
            {
                selectedMetaItem !== null ?
                    <MetaPreviewSheet
                        show={isMobile && mobilePreviewOpen}
                        onCloseRequest={closeMobilePreview}
                        onExited={onMobilePreviewExited}
                        ariaLabel={selectedMetaItem.name}
                    >
                        <MetaPreview
                            {...metaPreviewProps}
                            background={selectedMetaItem.background || selectedMetaItem.poster}
                            links={selectedMetaItem.links?.filter((link) => link?.category !== 'Cast' && link?.category !== 'Directors')}
                            onShowClick={onMobileShowClick}
                            showIcon={'chevron-forward'}
                        />
                    </MetaPreviewSheet>
                    :
                    null
            }
            <FiltersSheet inputs={menuInputs} show={isMobile && filtersOpen} onCloseRequest={closeFilters} />
            {
                filtersOpen && !isMobile ?
                    <ModalDialog title={t('CATALOG_FILTERS')} className={styles['selectable-inputs-modal']} onCloseRequest={closeFilters}>
                        {menuInputs.map(({ title, options, value, onSelect }, index) => (
                            <MultiselectMenu
                                key={index}
                                className={styles['select-input']}
                                title={title}
                                options={options}
                                value={value}
                                onSelect={onSelect}
                            />
                        ))}
                    </ModalDialog>
                    :
                    null
            }
            {
                addonModalOpen && discover.selected !== null ?
                    <AddonDetailsModal transportUrl={discover.selected.request.base} onCloseRequest={closeAddonModal} />
                    :
                    null
            }
        </MainNavBars>
    );
};

const DiscoverFallback = () => (
    <MainNavBars className={styles['discover-container']} route={'discover'} />
);

module.exports = withCoreSuspender(Discover, DiscoverFallback);
