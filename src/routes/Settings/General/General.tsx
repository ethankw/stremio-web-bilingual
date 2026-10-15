import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCore } from 'stremio/core';
import { Button, Toggle } from 'stremio/components';
import { usePlatform, useToast, useDiscord } from 'stremio/common';
import { Section, Option, Link } from '../components';
import { Setting } from '../Presentation';
import User from './User';
import useDataExport from './useDataExport';
import styles from './General.less';

type Props = {
    profile: Profile,
    onAccount: () => void,
};

const General = forwardRef<HTMLDivElement, Props>(({ profile, onAccount }: Props, ref) => {
    const { t } = useTranslation();
    const core = useCore();
    const platform = usePlatform();
    const toast = useToast();
    const discord = useDiscord();
    const [dataExport, loadDataExport] = useDataExport();

    const [traktAuthStarted, setTraktAuthStarted] = useState(false);

    const isTraktAuthenticated = useMemo(() => {
        const trakt = profile?.auth?.user?.trakt;
        return trakt && (Date.now() / 1000) < (trakt.created_at + trakt.expires_in);
    }, [profile.auth]);

    const onExportData = useCallback(() => {
        loadDataExport();
    }, []);

    const onCalendarSubscribe = useCallback(() => {
        if (!profile.auth) return;

        const protocol = platform.name === 'ios' ? 'webcal' : 'https';
        const url = `${protocol}://www.strem.io/calendar/${profile.auth.user._id}.ics`;
        platform.openExternal(url);

        toast.show({
            type: 'success',
            title: platform.name === 'ios' ?
                t('SETTINGS_SUBSCRIBE_CALENDAR_IOS_TOAST') :
                t('SETTINGS_SUBSCRIBE_CALENDAR_TOAST'),
            timeout: 25000
        });
        // Stremio 4 emits not documented event subscribeCalendar
    }, [profile.auth]);

    const onToggleTrakt = useCallback(() => {
        if (!isTraktAuthenticated && profile.auth !== null && profile.auth.user !== null && typeof profile.auth.user._id === 'string') {
            platform.openExternal(`https://www.strem.io/trakt/auth/${profile.auth.user._id}`);
            setTraktAuthStarted(true);
        } else {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'LogoutTrakt'
                }
            });
        }
    }, [isTraktAuthenticated, profile.auth]);

    const discordToggle = useMemo(() => ({
        checked: profile.settings.discordRpcEnabled === true,
        onClick: () => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        discordRpcEnabled: !profile.settings.discordRpcEnabled
                    }
                }
            });
        }
    }), [profile.settings]);

    useEffect(() => {
        if (dataExport.exportUrl) {
            platform.openExternal(dataExport.exportUrl);
        }
    }, [dataExport.exportUrl]);

    useEffect(() => {
        if (isTraktAuthenticated && traktAuthStarted) {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'InstallTraktAddon'
                }
            });
            setTraktAuthStarted(false);
        }
    }, [isTraktAuthenticated, traktAuthStarted]);

    return <>
        <Section ref={ref} settingGroup={'account'} label={'SETTINGS_ACCOUNT'}>
            <Setting id={'SETTINGS_ACCOUNT'}><User profile={profile} /></Setting>
            <Setting id={'SETTINGS_ACCOUNT'}><Button className={styles['account-action']} onClick={onAccount}>{t('SETTINGS_ACCOUNT_SECURITY')}</Button></Setting>
            <Option className={styles['trakt-container']} icon={'trakt'} label={'SETTINGS_TRAKT'}>
                <Button className={'button'} title={isTraktAuthenticated ? t('LOG_OUT') : t('SETTINGS_TRAKT_AUTHENTICATE')} disabled={profile.auth === null} onClick={onToggleTrakt}>
                    {isTraktAuthenticated ? t('LOG_OUT') : t('SETTINGS_TRAKT_AUTHENTICATE')}
                </Button>
            </Option>
        </Section>
        <Section settingGroup={'account-security'} label={'SETTINGS_ACCOUNT_SECURITY'}>
            <Setting id={'SETTINGS_ACCOUNT_SECURITY'}><p>{t(profile.auth ? 'SETTINGS_ACCOUNT_SECURITY_HINT' : 'SETTINGS_ACCOUNT_LOGIN_HINT')}</p>{!profile.auth && <Link label={t('LOG_IN')} href={'#/intro'} target={'_self'} />}</Setting>
            {profile?.auth?.user && <Link settingId={'SETTINGS_DATA_EXPORT'} label={t('SETTINGS_DATA_EXPORT')} onClick={onExportData} />}
            {profile?.auth?.user?.email && <Link settingId={'SETTINGS_CHANGE_PASSWORD'} label={t('SETTINGS_CHANGE_PASSWORD')} href={`https://www.strem.io/reset-password/${encodeURIComponent(profile.auth.user.email)}`} />}
            {profile?.auth?.user && <Link settingId={'SETTINGS_ACC_DELETE'} label={t('SETTINGS_ACC_DELETE')} href={'https://stremio.zendesk.com/hc/en-us/articles/360021428911-How-to-delete-my-account'} />}
        </Section>
        <Section settingGroup={'connections'} label={'SETTINGS_CONNECTIONS'}>
            {profile?.auth?.user && <Link settingId={'SETTINGS_SUBSCRIBE_CALENDAR'} label={t('SETTINGS_SUBSCRIBE_CALENDAR')} onClick={onCalendarSubscribe} />}
            {discord.available && <Option className={styles['discord-container']} icon={'discord'} label={'SETTINGS_DISCORD'}><Toggle {...discordToggle} /></Option>}
        </Section>
        <Section settingGroup={'about'} label={'BILINGUAL_ABOUT'}>
            <Link settingId={'SETTINGS_SUPPORT'} label={t('SETTINGS_SUPPORT')} href={'https://stremio.zendesk.com/hc/en-us'} />
            <Link settingId={'SETTINGS_SOURCE_CODE'} label={t('SETTINGS_SOURCE_CODE')} href={`https://github.com/ethankw/stremio-web-bilingual/tree/${process.env.COMMIT_HASH}`} />
            <Link settingId={'TERMS_OF_SERVICE'} label={t('TERMS_OF_SERVICE')} href={'https://www.stremio.com/tos'} />
            <Link settingId={'PRIVACY_POLICY'} label={t('PRIVACY_POLICY')} href={'https://www.stremio.com/privacy'} />
            <Setting id={'BILINGUAL_ABOUT'}><div className={styles['credits']}>
                <p>{t('BILINGUAL_FORK_NOTICE')}</p>
                <p>{t('BILINGUAL_SOURCE_LICENSE', { version: process.env.VERSION })}</p>
                <p>{t('BILINGUAL_BUILD', { sha: process.env.COMMIT_HASH })}</p>
                <a href={'https://www.themoviedb.org'} target={'_blank'} rel={'noopener noreferrer'}><img className={styles['tmdb-logo']} src={'images/tmdb-logo.svg'} alt={'The Movie Database (TMDB)'} /></a>
                <p>{t('BILINGUAL_TMDB_NOTICE')}</p>
            </div></Setting>
        </Section>
    </>;

});

export default General;
