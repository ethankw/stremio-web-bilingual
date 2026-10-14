// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const useBilingualMetadata = require('./useBilingualMetadata');
const { useBilingualSettings } = require('./settings');
const { getBilingualClient, getBilingualTitleText } = require('./client');

const clearBilingualCache = () => getBilingualClient().clearCache();

module.exports = {
    useBilingualMetadata,
    useBilingualSettings,
    clearBilingualCache,
    getBilingualTitleText,
};
