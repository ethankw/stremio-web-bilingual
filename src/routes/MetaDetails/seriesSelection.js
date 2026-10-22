// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const defaultSeason = (seasons, videos, requested, resumeId) => {
    if (seasons.includes(requested)) return requested;
    const resume = videos.find((video) => video.id === resumeId);
    if (resume && seasons.includes(resume.season)) return resume.season;
    return seasons.find((season) => season > 0) ?? seasons[0] ?? null;
};
const episodeCoordinates = (videoId) => {
    const match = typeof videoId === 'string' && /:(\d+):(\d+)$/.exec(videoId);
    return { season: match ? Number(match[1]) : 1, episode: match && Number(match[2]) > 0 ? Number(match[2]) : 1 };
};
module.exports = { defaultSeason, episodeCoordinates };
