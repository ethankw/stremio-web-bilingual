const releaseText = (value) => {
    if (typeof value !== 'string') return '';
    // Release line only: exclude peer counts, trackers and language metadata.
    let text = value.split(/[\r\n]/, 1)[0].normalize('NFKC').slice(0, 4096);
    // Avoid interpreting a title such as Cam.2018 as its source.
    text = text.replace(/^.*?(?:^|[^\d])(?:19|20)\d{2}(?=[^\d]|$)/, ' ');
    return text.replace(/\.ts$/i, '');
};

// Most specific filename first; addon quality is a fallback, not an override.
module.exports = (stream) => [stream.behaviorHints?.filename, stream.deepLinks?.externalPlayer?.fileName, stream.description,
    ...(typeof stream.name === 'string' ? stream.name.split(/[\r\n]/) : [])]
    .map(releaseText).filter(Boolean);
