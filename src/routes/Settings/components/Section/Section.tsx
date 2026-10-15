import React, { forwardRef } from 'react';
import classNames from 'classnames';
import { t } from 'i18next';
import { useSettingsPresentation } from '../../Presentation';
import styles from './Section.less';

type Props = {
    settingGroup?: string,
    className?: string,
    label?: string,
    children: React.ReactNode,
};

const Section = forwardRef<HTMLDivElement, Props>(({ settingGroup, className, label, children }: Props, ref) => {
    const { groupVisible } = useSettingsPresentation();
    if (settingGroup && !groupVisible(settingGroup)) return null;
    return (
        <div ref={ref} className={classNames(className, styles['section'])}>
            {
                label &&
                    <div className={styles['label']}>
                        {t(label)}
                    </div>
            }
            { children }
        </div>
    );
});

export default Section;
