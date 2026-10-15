// Copyright (C) 2017-2026 Smart code 203358507
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform, useProfile, useStreamingServer, useDiscord, withCoreSuspender } from 'stremio/common';
import { MainNavBars } from 'stremio/components';
import { SETTINGS_CATALOG, matchesSetting } from './catalog';
import { SettingsPresentation, SettingsLevel, Setting } from './Presentation';
import General from './General';
import Interface from './Interface';
import Player from './Player';
import Streaming from './Streaming';
import Shortcuts from './Shortcuts';
import Info from './Info';
import PluginSettings from './Plugins/PluginSettings';
import ServiceStatus from './ServiceStatus';
import styles from './Settings.less';

const levels: SettingsLevel[] = ['common', 'advanced'];
const levelLabels: Record<SettingsLevel, string> = {
    common: 'SETTINGS_COMMON', advanced: 'SETTINGS_ADVANCED', account: 'SETTINGS_ACCOUNT_SECURITY',
    about: 'BILINGUAL_ABOUT', shortcuts: 'SETTINGS_NAV_SHORTCUTS',
};
const Settings = () => {
    const { t } = useTranslation();
    const profile = useProfile();
    const platform = usePlatform();
    const streamingServer = useStreamingServer();
    const discord = useDiscord();
    const [level, setLevel] = useState<SettingsLevel>('common');
    const [query, setQuery] = useState('');
    const [draftDirty, setDraftDirty] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    const unavailable = useMemo(() => {
        const hidden = new Set<string>();
        if (!profile.auth) ['SETTINGS_DATA_EXPORT', 'SETTINGS_CHANGE_PASSWORD', 'SETTINGS_ACC_DELETE', 'SETTINGS_SUBSCRIBE_CALENDAR'].forEach((id) => hidden.add(id));
        if (!discord.available) hidden.add('SETTINGS_DISCORD');
        if (platform.isMobile) hidden.add('SETTINGS_NAV_SHORTCUTS');
        if (!platform.shell.active) ['SETTINGS_QUIT_ON_CLOSE', 'SETTINGS_FULLSCREEN_EXIT', 'SETTINGS_HWDEC', 'SETTINGS_GPU_VIDEO_PROCESSING', 'SETTINGS_VIDEO_MODE', 'SETTINGS_PAUSE_MINIMIZED'].forEach((id) => hidden.add(id));
        if (!platform.shell.capabilities.gpuVideoProcessing) hidden.add('SETTINGS_GPU_VIDEO_PROCESSING');
        if (platform.name !== 'windows') hidden.add('SETTINGS_VIDEO_MODE');
        if (streamingServer.settings?.type !== 'Ready') ['SETTINGS_HTTPS_ENDPOINT', 'SETTINGS_SERVER_CACHE_SIZE', 'SETTINGS_CACHING_DRIVE', 'SETTINGS_SERVER_TORRENT_PROFILE', 'SETTINGS_TRANSCODE_PROFILE'].forEach((id) => hidden.add(id));
        if (!streamingServer.remoteUrl) hidden.add('SETTINGS_REMOTE_URL');
        if (!profile.auth || streamingServer.networkInfo?.type !== 'Ready') hidden.add('SETTINGS_HTTPS_ENDPOINT');
        if (streamingServer.deviceInfo?.type !== 'Ready') hidden.add('SETTINGS_TRANSCODE_PROFILE');
        if (!platform.shell.active || !platform.shell.capabilities.cacheDirectoryPicker) hidden.add('SETTINGS_CACHING_DRIVE');
        return hidden;
    }, [profile.auth, platform, discord.available, streamingServer]);
    const visibleEntries = SETTINGS_CATALOG.filter((entry) => !unavailable.has(entry.id) && matchesSetting(entry, level, query, (key: string) => t(key)));
    const mayLeaveDraft = () => !draftDirty || window.confirm(t('SETTINGS_PLUGIN_DISCARD'));
    const navigate = (next: SettingsLevel) => {
        if (!mayLeaveDraft()) return;
        setDraftDirty(false);
        setLevel(next);
        setQuery('');
        container.current?.scrollTo({ top: 0 });
    };
    const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
        let next = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = 1;
        else return;
        event.preventDefault();
        navigate(levels[next]);
        tabs.current[next]?.focus();
    };
    return <MainNavBars className={styles['settings-container']} route={'settings'}>
        <SettingsPresentation.Provider value={{ level, query, unavailable, draftDirty, setDraftDirty }}>
            <div className={styles['settings-content']}>
                <header className={styles['header']}>
                    <div><h1>{t('SETTINGS_TITLE')}</h1><p>{t('SETTINGS_INTRO')}</p></div>
                    <input type={'search'} className={styles['search']} aria-label={t('SETTINGS_SEARCH')} placeholder={t('SETTINGS_SEARCH')} value={query} onChange={(event) => { if (mayLeaveDraft()) { setDraftDirty(false); setQuery(event.target.value); } }} />
                    <div className={styles['navigation']}>
                        <div role={'tablist'} aria-label={t('SETTINGS_TITLE')} className={styles['tabs']}>
                            {levels.map((item, index) => <button key={item} ref={(node) => { tabs.current[index] = node; }} type={'button'} role={'tab'} id={`settings-tab-${item}`} aria-selected={!query && level === item} aria-controls={'settings-panel'} tabIndex={level === item || (!levels.includes(level) && index === 0) ? 0 : -1} onKeyDown={(event) => onTabKeyDown(event, index)} onClick={() => navigate(item)}>{t(levelLabels[item])}</button>)}
                        </div>
                        <nav aria-label={t('SETTINGS_HELP')} className={styles['secondary']}>
                            {(['account', 'about', ...(!platform.isMobile ? ['shortcuts'] : [])] as SettingsLevel[]).map((item) => <button key={item} type={'button'} aria-current={level === item && !query ? 'page' : undefined} onClick={() => navigate(item)}>{t(levelLabels[item])}</button>)}
                        </nav>
                    </div>
                </header>
                <div ref={container} className={styles['sections-container']} id={'settings-panel'} role={levels.includes(level) && !query ? 'tabpanel' : 'region'} aria-label={query ? t('SETTINGS_SEARCH_RESULTS') : t(levelLabels[level])} aria-labelledby={levels.includes(level) && !query ? `settings-tab-${level}` : undefined} tabIndex={0}>
                    {query && <p className={styles['hint']} role={'status'}>{t('SETTINGS_SEARCH_ALL')}</p>}
                    {!query && level === 'advanced' && <p className={styles['hint']}>{t('SETTINGS_ADVANCED_HINT')}</p>}
                    {!visibleEntries.length && <p role={'status'} className={styles['hint']}>{t('SETTINGS_NO_RESULTS')}</p>}
                    <General profile={profile} onAccount={() => navigate('account')} />
                    <Interface profile={profile} />
                    <Player profile={profile} />
                    <Setting id={'SETTINGS_MY_ADDONS'}><PluginSettings /></Setting>
                    <Setting id={'SETTINGS_SERVICE_STATUS'}><ServiceStatus streamingServer={streamingServer} onAdvanced={() => navigate('advanced')} /></Setting>
                    <Streaming profile={profile} streamingServer={streamingServer} />
                    {!platform.isMobile && <Setting id={'SETTINGS_NAV_SHORTCUTS'}><Shortcuts /></Setting>}
                    <Setting id={'BILINGUAL_ABOUT'}><Info streamingServer={streamingServer} /></Setting>
                </div>
            </div>
        </SettingsPresentation.Provider>
    </MainNavBars>;
};
const SettingsFallback = () => <MainNavBars className={styles['settings-container']} route={'settings'} />;
export default withCoreSuspender(Settings, SettingsFallback);
