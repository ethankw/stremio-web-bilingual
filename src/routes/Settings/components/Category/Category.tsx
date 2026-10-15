import React from 'react';
import { t } from 'i18next';
import Icon from '@stremio/stremio-icons/react';
import { useSettingsPresentation } from '../../Presentation';
import styles from './Category.less';

type Props = {
    settingGroup?: string,
    icon: string,
    label: string,
    children: React.ReactNode,
};

const Category = ({ settingGroup, icon, label, children }: Props) => {
    const { groupVisible } = useSettingsPresentation();
    if (settingGroup && !groupVisible(settingGroup)) return null;
    return (
        <div className={styles['category']}>
            <div className={styles['heading']}>
                <Icon className={styles['icon']} name={icon} />
                <div className={styles['label']}>
                    {t(label)}
                </div>
            </div>
            {children}
        </div>
    );
};

export default Category;
