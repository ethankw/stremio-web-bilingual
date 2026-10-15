import React from 'react';
import { useSettingsPresentation } from '../../Presentation';
import { Button } from 'stremio/components';
import styles from './Link.less';

type Props = {
    settingId?: string,
    label: string,
    href?: string,
    target?: string,
    onClick?: () => void,
};

const Link = ({ settingId, label, href, target, onClick }: Props) => {
    const { visible } = useSettingsPresentation();
    if (settingId && !visible(settingId)) return null;
    return (
        <Button className={styles['link']} title={label} target={target ?? '_blank'} href={href} onClick={onClick}>
            <div className={styles['label']}>{ label }</div>
        </Button>
    );
};

export default Link;
