// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { Button } = require('stremio/components');
const useTranslate = require('stremio/common/useTranslate');
const styles = require('./styles');
const { personImage } = require('./people');

const PersonAvatar = ({ image }) => {
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => setFailed(false), [image]);
    return (
        <span className={styles['person-avatar']} aria-hidden={true}>
            {image && !failed ? <img src={image} alt="" title="TMDB" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <svg className={styles['person-placeholder']} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3z" /></svg>}
        </span>
    );
};
PersonAvatar.propTypes = { image: PropTypes.string };

const MetaLinks = ({ className, label, links, people }) => {
    const category = label;
    const { string, stringWithPrefix } = useTranslate();
    return (
        <div className={classnames(className, styles['meta-links-container'])}>
            {
                typeof label === 'string' && label.length > 0 ?
                    <div className={styles['label-container']}>
                        { stringWithPrefix(label.toUpperCase(), 'LINKS_') }
                    </div>
                    :
                    null
            }
            {
                Array.isArray(links) && links.length > 0 ?
                    <div className={styles['links-container']}>
                        {links.map(({ label, href, personId }, index) => (
                            <Button key={index} className={styles['link-container']} title={label} href={href}>
                                {(category === 'Cast' || category === 'Directors') ? <PersonAvatar image={personImage(people, label, category, personId)} /> : null}
                                { category === 'Cast' || category === 'Directors' ? label : string(label) }
                            </Button>
                        ))}
                    </div>
                    :
                    null
            }
        </div>
    );
};

MetaLinks.propTypes = {
    className: PropTypes.string,
    label: PropTypes.string,
    people: PropTypes.array,
    links: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string,
        personId: PropTypes.number,
        href: PropTypes.string
    }))
};

module.exports = MetaLinks;
