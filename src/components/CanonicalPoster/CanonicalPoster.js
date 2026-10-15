// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.
const React = require('react');
const PropTypes = require('prop-types');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { default: Image } = require('stremio/components/Image');
const { useBilingualMetadata } = require('stremio/common/bilingual');
const { canonicalArtwork, identityFromDetailLink } = require('stremio/common/bilingual/presentation');

const CanonicalPoster = ({ detailHref, src, ...props }) => {
    const identity = identityFromDetailLink(detailHref);
    const bilingual = useBilingualMetadata(identity, { priority: 1 });
    return <Image renderFallback={() => <Icon className={props.className} name={'symbol'} />} {...props} src={canonicalArtwork(bilingual.metadata, 'poster', src, bilingual.enabled)} />;
};
CanonicalPoster.propTypes = { detailHref: PropTypes.string, src: PropTypes.string, className: PropTypes.string };
module.exports = CanonicalPoster;
