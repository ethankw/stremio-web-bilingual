// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const styles = require('./styles.less');
const { getBilingualOverviewEntries } = require('../../common/bilingual/client');
const { useBilingualSettings } = require('../../common/bilingual/settings');

const BilingualOverview = ({ metadata, originalDescription, className }) => {
    const { settings } = useBilingualSettings();
    const { t } = useTranslation();
    const labels = {
        original: t('BILINGUAL_OVERVIEW_ORIGINAL', { defaultValue: '原始简介' }),
        english: t('BILINGUAL_OVERVIEW_EN', { defaultValue: 'English overview' }),
        chinese: t('BILINGUAL_OVERVIEW_ZH', { defaultValue: '中文简介' }),
        englishMissing: t('BILINGUAL_OVERVIEW_EN_MISSING', { defaultValue: 'English overview unavailable' }),
        chineseMissing: t('BILINGUAL_OVERVIEW_ZH_MISSING', { defaultValue: '中文简介暂缺' }),
        empty: t('BILINGUAL_OVERVIEW_EMPTY', { defaultValue: '暂无简介' }),
    };
    const entries = getBilingualOverviewEntries(metadata, originalDescription, settings.overviewOrder, labels);

    return React.createElement(
        'div',
        { className: classnames(styles['bilingual-overview'], className), 'data-bilingual-overview': true },
        entries.map((entry, index) => entry.language === 'original' ?
            React.createElement(
                'div',
                { className: styles['overview-original'], key: `${entry.language}-${index}` },
                React.createElement('div', { className: styles['overview-label'] }, entry.label),
                React.createElement('p', { className: styles['overview-copy'] }, entry.text),
            )
            :
            entry.available ?
                React.createElement(
                    'details',
                    { className: styles['overview-entry'], open: true, key: `${entry.language}-${index}` },
                    React.createElement('summary', { className: styles['overview-summary'], 'data-language': entry.language }, entry.label),
                    React.createElement('p', { className: styles['overview-copy'] }, entry.text),
                )
                :
                React.createElement(
                    'div',
                    { className: styles['overview-missing'], 'data-language': entry.language, key: `${entry.language}-${index}` },
                    entry.text,
                ),
        ),
    );
};

BilingualOverview.displayName = 'BilingualOverview';

BilingualOverview.propTypes = {
    metadata: PropTypes.object,
    originalDescription: PropTypes.string,
    className: PropTypes.string,
};

module.exports = BilingualOverview;
