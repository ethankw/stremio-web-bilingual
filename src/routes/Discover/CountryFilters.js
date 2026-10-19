// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const React = require('react');
const PropTypes = require('prop-types');
const { useTranslation } = require('react-i18next');
const { countryGroups, countryName } = require('stremio/common/productionCountries');
const styles = require('./styles');

const CountryFilters = ({ excluded, toggle }) => {
    const { t, i18n } = useTranslation();
    const groups = React.useMemo(() => countryGroups(i18n.language), [i18n.language]);
    return <div className={styles['country-filters']} aria-label={t('COUNTRIES_LABEL')}>
        {groups.map((group) => <fieldset key={group.id} className={styles['country-group']}>
            <legend>{t(`COUNTRIES_GROUP_${group.id}`)}</legend>
            <div className={styles['country-options']} tabIndex={0} role={'group'} aria-label={t(`COUNTRIES_GROUP_${group.id}`)}>
                {group.codes.map((code) => <button key={code} type={'button'} role={'checkbox'}
                    data-country={code} aria-checked={!excluded.includes(code)}
                    className={styles['country-chip']} onClick={() => toggle(code)}>
                    <span aria-hidden={true}>{excluded.includes(code) ? '−' : '✓'}</span>
                    {countryName(code, i18n.language)}
                </button>)}
            </div>
        </fieldset>)}
    </div>;
};
CountryFilters.propTypes = { excluded: PropTypes.arrayOf(PropTypes.string).isRequired, toggle: PropTypes.func.isRequired };
module.exports = CountryFilters;
