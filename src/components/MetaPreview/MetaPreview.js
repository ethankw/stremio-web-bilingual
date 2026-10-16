// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const UrlUtils = require('url');
const { useTranslation } = require('react-i18next');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { default: Button } = require('stremio/components/Button');
const { default: Image } = require('stremio/components/Image');
const { default: ActionsGroup } = require('stremio/components/ActionsGroup');
const ModalDialog = require('stremio/components/ModalDialog');
const SharePrompt = require('stremio/components/SharePrompt');
const CONSTANTS = require('stremio/common/CONSTANTS');
const { default: useMediaQuery } = require('stremio/common/useMediaQuery');
const screenSizes = require('stremio/common/screen-sizes.less');
const routesRegexp = require('stremio/common/routesRegexp');
const useBinaryState = require('stremio/common/useBinaryState');
const ActionButton = require('./ActionButton');
const MetaLinks = require('./MetaLinks');
const { canonicalArtwork } = require('stremio/common/bilingual/presentation');
const { canonicalCreditGroups } = require('./MetaLinks/people');
const usePeople = require('./MetaLinks/usePeople');
const MetaPreviewPlaceholder = require('./MetaPreviewPlaceholder');
const styles = require('./styles');
const { Ratings } = require('./Ratings');
const { useBilingualMetadata } = require('stremio/common/bilingual');
const { BilingualTitle, BilingualOverview } = require('stremio/components/BilingualMetadata');

const ALLOWED_LINK_REDIRECTS = [
    routesRegexp.search.regexp,
    routesRegexp.discover.regexp,
    routesRegexp.metadetails.regexp
];

// Personal bilingual display only: original metadata and actions stay unchanged.
const MetaPreview = React.forwardRef(({ className, compact, name, logo, background, runtime, releaseInfo, released, description, deepLinks, links, trailerStreams, inLibrary, toggleInLibrary, watched, toggleWatched, ratingInfo, metadata, children, actions, showIcon = 'play', onShowClick, bilingualIdentity, bilingualEpisode, bilingualEpisodeName, bilingualEpisodeOverview }, ref) => {
    const { t } = useTranslation();
    const bilingual = useBilingualMetadata(bilingualIdentity, { priority: 0 });
    const episodeBilingual = useBilingualMetadata(bilingualEpisode, { priority: 0 });
    const people = usePeople(bilingualIdentity, bilingual.enabled && bilingual.metadata?.matchStatus === 'matched');
    const displayBilingual = bilingualEpisode ? episodeBilingual : bilingual;
    const [shareModalOpen, openShareModal, closeShareModal] = useBinaryState(false);
    const isMobileLandscape = useMediaQuery(`(max-width: ${screenSizes.xsmall}) and (max-height: ${screenSizes['phone-landscape-size']}) and (orientation: landscape)`);
    const iconActions = compact && isMobileLandscape;
    const originalLinksGroups = React.useMemo(() => {
        return Array.isArray(links) ?
            links
                .filter((link) => link && typeof link.category === 'string' && typeof link.url === 'string')
                .reduce((linksGroups, { category, name, url }) => {
                    const { protocol, path, pathname, hostname } = UrlUtils.parse(url);
                    if (category === CONSTANTS.IMDB_LINK_CATEGORY) {
                        if (hostname === 'imdb.com') {
                            linksGroups.set(category, {
                                label: name,
                                href: `https://www.stremio.com/warning#${encodeURIComponent(url)}`
                            });
                        }
                    } else if (category === CONSTANTS.SHARE_LINK_CATEGORY) {
                        linksGroups.set(category, {
                            label: name,
                            href: url
                        });
                    } else {
                        if (protocol === 'stremio:') {
                            if (pathname !== null && ALLOWED_LINK_REDIRECTS.some((regexp) => pathname.match(regexp))) {
                                if (!linksGroups.has(category)) {
                                    linksGroups.set(category, []);
                                }
                                linksGroups.get(category).push({
                                    label: name,
                                    href: `#${path}`
                                });
                            }
                        } else if (typeof hostname === 'string' && hostname.length > 0) {
                            if (!linksGroups.has(category)) {
                                linksGroups.set(category, []);
                            }
                            linksGroups.get(category).push({
                                label: name,
                                href: `https://www.stremio.com/warning#${encodeURIComponent(url)}`
                            });
                        }
                    }

                    return linksGroups;
                }, new Map())
            :
            new Map();
    }, [links]);
    const linksGroups = React.useMemo(() => canonicalCreditGroups(originalLinksGroups, people, bilingual.enabled), [originalLinksGroups, people, bilingual.enabled]);
    const displayLogo = canonicalArtwork(bilingual.metadata, 'logo', logo, bilingual.enabled);
    const displayBackground = canonicalArtwork(bilingual.metadata, 'background', background, bilingual.enabled);
    const showHref = React.useMemo(() => {
        return deepLinks ?
            typeof deepLinks.player === 'string' ?
                deepLinks.player
                :
                typeof deepLinks.metaDetailsStreams === 'string' ?
                    deepLinks.metaDetailsStreams
                    :
                    typeof deepLinks.metaDetailsVideos === 'string' ?
                        deepLinks.metaDetailsVideos
                        :
                        null
            :
            null;
    }, [deepLinks]);
    const trailerHref = React.useMemo(() => {
        if (!Array.isArray(trailerStreams) || trailerStreams.length === 0) {
            return null;
        }

        return trailerStreams[0].deepLinks.player;
    }, [trailerStreams]);
    const renderLogoFallback = React.useCallback(() => (
        bilingual.enabled ? null : <div className={styles['logo-placeholder']}>{name}</div>
    ), [name, bilingual.enabled]);
    const metaItemActions = React.useMemo(() => [
        {
            icon: inLibrary ? 'remove-from-library' : 'add-to-library',
            label: inLibrary ? t('REMOVE_FROM_LIB') : t('ADD_TO_LIB'),
            onClick: typeof toggleInLibrary === 'function' ? toggleInLibrary : null,
        },
        {
            icon: watched ? 'eye-off' : 'eye',
            label: watched ? t('CTX_MARK_UNWATCHED') : t('CTX_MARK_WATCHED'),
            onClick: typeof toggleWatched === 'function' ? toggleWatched : undefined,
        },
    ], [inLibrary, watched, toggleInLibrary, toggleWatched]);
    return (
        <div className={classnames(className, styles['meta-preview-container'], { [styles['compact']]: compact })} ref={ref}>
            {
                typeof displayBackground === 'string' && displayBackground.length > 0 ?
                    <div className={styles['background-image-layer']}>
                        <Image className={styles['background-image']} src={displayBackground} alt={' '} />
                    </div>
                    :
                    null
            }
            <div className={styles['meta-info-container']}>
                {
                    typeof displayLogo === 'string' && displayLogo.length > 0 ?
                        <Image
                            className={styles['logo']}
                            src={displayLogo}
                            alt={' '}
                            title={name}
                            renderFallback={renderLogoFallback}
                        />
                        :
                        renderLogoFallback()
                }
                {
                    bilingual.enabled ?
                        <div className={styles['bilingual-title']}>
                            <BilingualTitle metadata={bilingual.metadata} originalName={name} />
                            {bilingualEpisode && bilingualEpisodeName ?
                                <BilingualTitle metadata={episodeBilingual.metadata} originalName={bilingualEpisodeName} compact={true} />
                                : null}
                        </div>
                        : null
                }
                {
                    metadata !== undefined ? metadata : (typeof releaseInfo === 'string' && releaseInfo.length > 0) || (released instanceof Date && !isNaN(released.getTime())) || (typeof runtime === 'string' && runtime.length > 0) || linksGroups.has(CONSTANTS.IMDB_LINK_CATEGORY) ?
                        <div className={styles['runtime-release-info-container']}>
                            {
                                typeof runtime === 'string' && runtime.length > 0 ?
                                    <div className={styles['runtime-label']}>{runtime}</div>
                                    :
                                    null
                            }
                            {
                                typeof releaseInfo === 'string' && releaseInfo.length > 0 ?
                                    <div className={styles['release-info-label']}>{releaseInfo}</div>
                                    :
                                    released instanceof Date && !isNaN(released.getTime()) ?
                                        <div className={styles['release-info-label']}>{released.getFullYear()}</div>
                                        :
                                        null
                            }
                            {
                                linksGroups.has(CONSTANTS.IMDB_LINK_CATEGORY) ?
                                    <Button
                                        className={styles['imdb-button-container']}
                                        title={linksGroups.get(CONSTANTS.IMDB_LINK_CATEGORY).label}
                                        href={linksGroups.get(CONSTANTS.IMDB_LINK_CATEGORY).href}
                                        target={'_blank'}
                                        tabIndex={0}
                                    >
                                        <div className={styles['label']}>{linksGroups.get(CONSTANTS.IMDB_LINK_CATEGORY).label}</div>
                                        <Icon className={styles['icon']} name={'imdb'} />
                                    </Button>
                                    :
                                    null
                            }
                        </div>
                        :
                        null
                }
                {
                    !bilingual.enabled && compact && typeof description === 'string' && description.length > 0 ?
                        <div className={styles['description-container']}>
                            {description}
                        </div>
                        :
                        null
                }
                {
                    Array.from(linksGroups.keys())
                        .filter((category) => {
                            return category !== CONSTANTS.IMDB_LINK_CATEGORY &&
                                category !== CONSTANTS.SHARE_LINK_CATEGORY &&
                                category !== CONSTANTS.WRITERS_LINK_CATEGORY &&
                                category !== 'Cast' && category !== 'Directors';
                        })
                        .map((category, index) => (
                            <MetaLinks
                                key={index}
                                className={styles['meta-links']}
                                label={category}
                                links={linksGroups.get(category)}
                                people={people}
                            />
                        ))
                }
                {
                    bilingual.enabled ?
                        <div className={styles['description-container']}>
                            <BilingualOverview
                                metadata={displayBilingual.metadata}
                                originalDescription={bilingualEpisode ? bilingualEpisodeOverview : description}
                            />
                            {displayBilingual.status === 'access-expired' ?
                                <div role={'status'}>{t('BILINGUAL_ACCESS_EXPIRED', { defaultValue: '双语资料访问已过期，请重新进入私人入口。原资料仍可使用。' })}</div>
                                : null}
                        </div>
                        : !compact && typeof description === 'string' && description.length > 0 ?
                            <div className={styles['description-container']}>
                                <div className={styles['label-container']}>
                                    {t('SUMMARY')}
                                </div>
                                {description}
                            </div>
                            :
                            null
                }
                {
                    ['Cast', 'Directors'].filter((category) => linksGroups.has(category)).map((category) => (
                        <MetaLinks
                            key={category}
                            className={styles['meta-links']}
                            label={category}
                            links={linksGroups.get(category)}
                            people={people}
                        />
                    ))
                }
                {children}
            </div>
            <div className={styles['action-buttons-container']}>
                {actions !== undefined ? actions : <>
                    {
                        typeof trailerHref === 'string' ?
                            <ActionButton
                                className={styles['action-button']}
                                icon={'trailer'}
                                label={t('TRAILER')}
                                tabIndex={0}
                                href={trailerHref}
                                tooltip={compact}
                            />
                            :
                            null
                    }
                    {
                        typeof toggleInLibrary === 'function' && typeof toggleWatched === 'function'
                            ? <ActionsGroup items={metaItemActions} className={styles['group-container']} />
                            : null
                    }
                    {
                        typeof showHref === 'string' && compact ?
                            <ActionButton
                                className={classnames(styles['action-button'], styles['show-button'])}
                                icon={showIcon}
                                label={t('SHOW')}
                                variant={iconActions ? 'icon' : 'wide'}
                                tooltip={iconActions}
                                tabIndex={0}
                                href={showHref}
                                onClick={onShowClick}
                            />
                            :
                            null
                    }
                    {
                        !compact && ratingInfo !== null ?
                            <Ratings
                                ratingInfo={ratingInfo}
                                className={styles['group-container']}
                            />
                            :
                            null
                    }
                    {
                        linksGroups.has(CONSTANTS.SHARE_LINK_CATEGORY) && !compact ?
                            <React.Fragment>
                                <ActionButton
                                    className={styles['action-button']}
                                    icon={'share'}
                                    label={t('CTX_SHARE')}
                                    tooltip={true}
                                    tabIndex={0}
                                    onClick={openShareModal}
                                />
                                {
                                    shareModalOpen ?
                                        <ModalDialog title={t('CTX_SHARE')} onCloseRequest={closeShareModal}>
                                            <SharePrompt
                                                className={styles['share-prompt']}
                                                url={linksGroups.get(CONSTANTS.SHARE_LINK_CATEGORY).href}
                                            />
                                        </ModalDialog>
                                        :
                                        null
                                }
                            </React.Fragment>
                            :
                            null
                    }
                </>}
            </div>
        </div>
    );
});

MetaPreview.Placeholder = MetaPreviewPlaceholder;

MetaPreview.propTypes = {
    bilingualIdentity: PropTypes.object,
    bilingualEpisode: PropTypes.object,
    bilingualEpisodeName: PropTypes.string,
    bilingualEpisodeOverview: PropTypes.string,
    metadata: PropTypes.node,
    children: PropTypes.node,
    actions: PropTypes.node,
    showIcon: PropTypes.string,
    className: PropTypes.string,
    compact: PropTypes.bool,
    name: PropTypes.string,
    logo: PropTypes.string,
    background: PropTypes.string,
    runtime: PropTypes.string,
    releaseInfo: PropTypes.string,
    released: PropTypes.instanceOf(Date),
    description: PropTypes.string,
    deepLinks: PropTypes.shape({
        metaDetailsVideos: PropTypes.string,
        metaDetailsStreams: PropTypes.string,
        player: PropTypes.string
    }),
    links: PropTypes.arrayOf(PropTypes.shape({
        category: PropTypes.string,
        name: PropTypes.string,
        url: PropTypes.string
    })),
    trailerStreams: PropTypes.array,
    inLibrary: PropTypes.bool,
    toggleInLibrary: PropTypes.func,
    watched: PropTypes.bool,
    toggleWatched: PropTypes.func,
    ratingInfo: PropTypes.object,
    onShowClick: PropTypes.func,
};

module.exports = MetaPreview;
