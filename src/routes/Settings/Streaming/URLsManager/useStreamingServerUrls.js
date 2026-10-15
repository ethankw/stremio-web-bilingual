// Copyright (C) 2017-2024 Smart code 203358507

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCore } from 'stremio/core';
import { useModelState, useSettings, useToast } from 'stremio/common';

const useStreamingServerUrls = () => {
    const core = useCore();
    const { t } = useTranslation();
    const [, updateSettings] = useSettings();
    const toast = useToast();
    const ctx = useModelState({ model: 'ctx' });
    const streamingServerUrls = ctx.streamingServerUrls;

    const addServerUrl = useCallback((url) => {
        const isValidUrl = (url) => {
            try {
                const parsed = new URL(url);
                return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
            } catch (_) {
                return false;
            }
        };

        if (isValidUrl(url)) {
            toast.show({
                type: 'success',
                title: t('SETTINGS_NEW_URL_ADDED'),

                timeout: 4000
            });

            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'AddServerUrl',
                    args: url,
                }
            });
        } else {
            toast.show({
                type: 'error',
                title: t('SETTINGS_INVALID_URL'),

                timeout: 4000
            });
        }
    }, [core.transport, t, toast]);

    const deleteServerUrl = useCallback((url) => {
        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'DeleteServerUrl',
                args: url,
            }
        });
    }, []);
    const selectServerUrl = useCallback((url) => {
        updateSettings({ streamingServerUrl: url });
    }, [updateSettings]);
    const reloadServer = useCallback(() => {
        core.transport.dispatch({
            action: 'StreamingServer',
            args: {
                action: 'Reload'
            }
        });
    }, []);

    return {
        streamingServerUrls,
        addServerUrl,
        deleteServerUrl,
        selectServerUrl,
        reloadServer
    };
};

export default useStreamingServerUrls;
