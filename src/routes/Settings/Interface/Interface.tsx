import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from 'stremio/common';
import { useBilingualSettings } from 'stremio/common/bilingual';
import { Button, Scale, MultiselectMenu, Toggle } from 'stremio/components';
import { Section, Option } from '../components';
import useInterfaceOptions from './useInterfaceOptions';

type Props = {
    profile: Profile,
};

const Interface = forwardRef<HTMLDivElement, Props>(({ profile }: Props, ref) => {
    const { shell } = usePlatform();
    const { t } = useTranslation();
    const { settings: bilingualSettings, updateSettings: updateBilingualSettings, clearCache } = useBilingualSettings();
    const bilingualToggle = {
        checked: bilingualSettings.enabled,
        onClick: () => updateBilingualSettings({ enabled: !bilingualSettings.enabled }),
        role: 'switch',
        'aria-checked': bilingualSettings.enabled,
        'aria-label': t('BILINGUAL_ENABLED', { defaultValue: '影视资料双语显示 / Bilingual metadata' }),
    };

    const {
        interfaceLanguageSelect,
        interfaceSize,
        quitOnCloseToggle,
        escExitFullscreenToggle,
        hideSpoilersToggle,
        gamepadSupportToggle,
    } = useInterfaceOptions(profile);

    return (
        <Section settingGroup={'interface'} ref={ref} label={'INTERFACE'}>
            <Option label={'BILINGUAL_ENABLED'}>
                <Toggle {...bilingualToggle} />
            </Option>
            <Option label={'BILINGUAL_TITLE_ORDER'}>
                <MultiselectMenu
                    className={'multiselect'}
                    value={bilingualSettings.titleOrder}
                    options={[
                        { value: 'en-first', label: t('BILINGUAL_EN_FIRST', { defaultValue: 'English → 中文' }) },
                        { value: 'zh-first', label: t('BILINGUAL_ZH_FIRST', { defaultValue: '中文 → English' }) },
                    ]}
                    onSelect={(value: string) => updateBilingualSettings({ titleOrder: value })}
                />
            </Option>
            <Option label={'BILINGUAL_OVERVIEW_ORDER'}>
                <MultiselectMenu
                    className={'multiselect'}
                    value={bilingualSettings.overviewOrder}
                    options={[
                        { value: 'zh-first', label: t('BILINGUAL_ZH_FIRST', { defaultValue: '中文 → English' }) },
                        { value: 'en-first', label: t('BILINGUAL_EN_FIRST', { defaultValue: 'English → 中文' }) },
                    ]}
                    onSelect={(value: string) => updateBilingualSettings({ overviewOrder: value })}
                />
            </Option>
            <Option label={'BILINGUAL_CACHE'}>
                <Button onClick={clearCache}>{t('BILINGUAL_CLEAR_CACHE', { defaultValue: '清除双语资料缓存 / Clear metadata cache' })}</Button>
            </Option>
            <Option label={'SETTINGS_UI_LANGUAGE'}>
                <MultiselectMenu
                    className={'multiselect'}
                    {...interfaceLanguageSelect}
                />
            </Option>
            <Option label={'SETTINGS_UI_ZOOM'}>
                <Scale {...interfaceSize} />
            </Option>
            {
                shell.active &&
                    <Option label={'SETTINGS_QUIT_ON_CLOSE'}>
                        <Toggle
                            tabIndex={0}
                            {...quitOnCloseToggle}
                        />
                    </Option>
            }
            {
                shell.active &&
                    <Option label={'SETTINGS_FULLSCREEN_EXIT'}>
                        <Toggle
                            tabIndex={0}
                            {...escExitFullscreenToggle}
                        />
                    </Option>
            }
            <Option label={'SETTINGS_BLUR_UNWATCHED_IMAGE'}>
                <Toggle
                    tabIndex={0}
                    {...hideSpoilersToggle}
                />
            </Option>
            <Option label={'SETTINGS_GAMEPAD'}>
                <Toggle
                    tabIndex={0}
                    {...gamepadSupportToggle}
                />
            </Option>
        </Section>
    );
});

export default Interface;
