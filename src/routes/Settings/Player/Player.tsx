import React, { forwardRef } from 'react';
import { ColorInput, MultiselectMenu, Toggle } from 'stremio/components';
import { usePlatform } from 'stremio/common';
import { Category, Option, Section } from '../components';
import usePlayerOptions from './usePlayerOptions';

type Props = {
    profile: Profile,
};

const Player = forwardRef<HTMLDivElement, Props>(({ profile }: Props, ref) => {
    const { shell } = usePlatform();
    const platform = usePlatform();

    const {
        subtitlesLanguageSelect,
        subtitlesSizeSelect,
        subtitlesTextColorInput,
        subtitlesBackgroundColorInput,
        subtitlesOutlineColorInput,
        assSubtitlesStylingToggle,
        audioLanguageSelect,
        surroundSoundToggle,
        seekTimeDurationSelect,
        seekShortTimeDurationSelect,
        playInExternalPlayerSelect,
        nextVideoPopupDurationSelect,
        bingeWatchingToggle,
        hardwareDecodingToggle,
        gpuVideoProcessingToggle,
        videoModeSelect,
        pauseOnMinimizeToggle,
    } = usePlayerOptions(profile);

    return (
        <Section settingGroup={'player'} ref={ref} label={'SETTINGS_NAV_PLAYER'}>
            <Category icon={'subtitles'} label={'SETTINGS_SECTION_SUBTITLES'} settingGroup={'subtitles'}>
                <Option label={'SETTINGS_SUBTITLES_LANGUAGE'}>
                    <MultiselectMenu
                        className={'multiselect'}
                        {...subtitlesLanguageSelect}
                    />
                </Option>
                <Option label={'SETTINGS_SUBTITLES_SIZE'}>
                    <MultiselectMenu
                        className={'multiselect'}
                        {...subtitlesSizeSelect}
                    />
                </Option>
                <Option label={'SETTINGS_SUBTITLES_COLOR'}>
                    <ColorInput
                        className={'color-input'}
                        {...subtitlesTextColorInput}
                    />
                </Option>
                <Option label={'SETTINGS_SUBTITLES_COLOR_BACKGROUND'}>
                    <ColorInput
                        className={'color-input'}
                        {...subtitlesBackgroundColorInput}
                    />
                </Option>
                <Option label={'SETTINGS_SUBTITLES_COLOR_OUTLINE'}>
                    <ColorInput
                        className={'color-input'}
                        {...subtitlesOutlineColorInput}
                    />
                </Option>
                <Option label={'SETTINGS_ASS_SUBTITLES_STYLING'}>
                    <Toggle
                        tabIndex={0}
                        {...assSubtitlesStylingToggle}
                    />
                </Option>
            </Category>
            <Category icon={'volume-medium'} label={'SETTINGS_SECTION_AUDIO'} settingGroup={'audio'}>
                <Option label={'SETTINGS_DEFAULT_AUDIO_TRACK'}>
                    <MultiselectMenu
                        className={'multiselect'}
                        {...audioLanguageSelect}
                    />
                </Option>
                <Option label={'SETTINGS_SURROUND_SOUND'}>
                    <Toggle
                        tabIndex={0}
                        {...surroundSoundToggle}
                    />
                </Option>
            </Category>
            <Category icon={'remote'} label={'SETTINGS_SECTION_CONTROLS'} settingGroup={'controls'}>
                <Option label={'SETTINGS_SEEK_KEY'}>
                    <MultiselectMenu
                        className={'multiselect'}
                        {...seekTimeDurationSelect}
                    />
                </Option>
                <Option label={'SETTINGS_SEEK_KEY_SHIFT'}>
                    <MultiselectMenu
                        className={'multiselect'}
                        {...seekShortTimeDurationSelect}
                    />
                </Option>
            </Category>
            <Category icon={'play'} label={'SETTINGS_SECTION_AUTO_PLAY'} settingGroup={'autoplay'}>
                <Option label={'AUTO_PLAY'}>
                    <Toggle
                        tabIndex={0}
                        {...bingeWatchingToggle}
                    />
                </Option>
                <Option label={'SETTINGS_NEXT_VIDEO_POPUP_DURATION'}>
                    <MultiselectMenu
                        className={'multiselect'}
                        {...nextVideoPopupDurationSelect}
                    />
                </Option>
            </Category>
            <Category icon={'glasses'} label={'SETTINGS_PLAYBACK_COMPATIBILITY'} settingGroup={'playback'}>
                <Option label={'SETTINGS_PLAY_IN_EXTERNAL_PLAYER'}>
                    <MultiselectMenu
                        className={'multiselect'}
                        {...playInExternalPlayerSelect}
                    />
                </Option>
                {
                    shell.active &&
                        <Option label={'SETTINGS_HWDEC'}>
                            <Toggle
                                tabIndex={0}
                                {...hardwareDecodingToggle}
                            />
                        </Option>
                }
                {
                    shell.active && shell.capabilities.gpuVideoProcessing &&
                        <Option label={'SETTINGS_GPU_VIDEO_PROCESSING'}>
                            <Toggle
                                tabIndex={0}
                                {...gpuVideoProcessingToggle}
                            />
                        </Option>
                }
                {
                    shell.active && platform.name === 'windows' &&
                        <Option label={'SETTINGS_VIDEO_MODE'}>
                            <MultiselectMenu
                                className={'multiselect'}
                                {...videoModeSelect}
                            />
                        </Option>
                }
                {
                    shell.active &&
                        <Option label={'SETTINGS_PAUSE_MINIMIZED'}>
                            <Toggle
                                tabIndex={0}
                                {...pauseOnMinimizeToggle}
                            />
                        </Option>
                }
            </Category>
        </Section>
    );
});

export default Player;
