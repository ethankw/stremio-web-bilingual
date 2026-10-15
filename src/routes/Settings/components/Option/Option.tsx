import React from 'react';
import { Toggle } from 'stremio/components';
import { SETTINGS_CATALOG } from '../../catalog';
import { useSettingsPresentation } from '../../Presentation';
import classNames from 'classnames';
import { t } from 'i18next';
import styles from './Option.less';
import Icon from '@stremio/stremio-icons/react';

type Props = {
    settingId?: string,
    className?: string,
    icon?: string,
    label: string,
    children: React.ReactNode,
};

const Option = ({ settingId, className, icon, label, children }: Props) => {
    const { visible, state } = useSettingsPresentation();
    const entry = SETTINGS_CATALOG.find((item) => item.id === (settingId || label));
    if (state && entry && !visible(entry.id)) return null;
    const accessibleChildren = React.Children.map(children, (child) => {
        if (React.isValidElement<Record<string, unknown>>(child) && child.type === Toggle) {
            return React.cloneElement(child, { role: 'switch', 'aria-checked': Boolean(child.props.checked), 'aria-label': t(label) });
        }
        return child;
    });
    return (
        <div className={classNames(className, styles['option'])}>
            <div className={styles['heading']}>
                {
                    icon &&
                        <Icon
                            className={styles['icon']}
                            name={icon}
                        />
                }
                <div className={styles['label']}>
                    {t(label)}
                    {state?.query && <small className={styles['level-label']}>{t(entry?.level === 'advanced' ? 'SETTINGS_ADVANCED' : 'SETTINGS_COMMON')}</small>}
                </div>
            </div>
            <div className={styles['content']} role={'group'} aria-label={t(label)}>
                { accessibleChildren }
            </div>
        </div>
    );
};

export default Option;
