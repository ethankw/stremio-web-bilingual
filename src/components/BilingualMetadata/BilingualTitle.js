// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const styles = require('./styles.less');
const { getBilingualTitleLines, getBilingualTitleText } = require('../../common/bilingual/client');
const { useBilingualSettings } = require('../../common/bilingual/settings');

const BilingualTitle = React.memo(({ metadata, originalName, compact, className }) => {
    const { settings } = useBilingualSettings();
    const { t } = useTranslation();
    const labels = {
        originalMissing: t('BILINGUAL_TITLE_ORIGINAL_MISSING', { defaultValue: 'Untitled' }),
        englishMissing: t('BILINGUAL_TITLE_EN_MISSING', { defaultValue: 'English title unavailable' }),
        chineseMissing: t('BILINGUAL_TITLE_ZH_MISSING', { defaultValue: '中文标题暂缺' }),
    };
    const titleText = getBilingualTitleText(metadata, originalName, settings.titleOrder, labels);
    const lines = getBilingualTitleLines(metadata, originalName, settings.titleOrder, labels);

    return React.createElement(
        'div',
        {
            className: classnames(styles['bilingual-title'], { [styles.compact]: compact }, className),
            title: titleText,
            'aria-label': titleText,
            'data-bilingual-title': true,
        },
        lines.map((line, index) => React.createElement(
            'div',
            {
                className: classnames(styles['title-line'], { [styles['title-line-missing']]: line.missing }),
                'data-language': line.language,
                key: `${line.language}-${index}`,
            },
            line.text,
        )),
    );
});

BilingualTitle.displayName = 'BilingualTitle';

BilingualTitle.propTypes = {
    metadata: PropTypes.object,
    originalName: PropTypes.string,
    compact: PropTypes.bool,
    className: PropTypes.string,
};

module.exports = BilingualTitle;
