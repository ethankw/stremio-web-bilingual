import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCore } from 'stremio/core';
import { Button } from 'stremio/components';
import { Section } from './components';
import styles from './Settings.less';

const ServiceStatus = ({ streamingServer, onAdvanced }: { streamingServer: StreamingServer, onAdvanced: () => void }) => {
    const { t } = useTranslation();
    const core = useCore();
    const state = streamingServer.settings?.type;
    const status = state === 'Ready' ? 'SETTINGS_SERVICE_CONNECTED' : state === 'Loading' ? 'SETTINGS_SERVICE_CONNECTING' : 'SETTINGS_SERVICE_DISCONNECTED';
    return <Section label={'SETTINGS_SERVICE_STATUS'}>
        <div className={styles['status-card']}>
            <p role={'status'}>{t(status)}</p><p>{t('SETTINGS_SERVICE_SCOPE')}</p>
            <div className={styles['actions']}>
                <Button onClick={() => core.transport.dispatch({ action: 'StreamingServer', args: { action: 'Reload' } })}>{t('SETTINGS_RECONNECT')}</Button>
                <Button onClick={onAdvanced}>{t('SETTINGS_CONNECTION_DETAILS')}</Button>
            </div>
        </div>
    </Section>;
};
export default ServiceStatus;
