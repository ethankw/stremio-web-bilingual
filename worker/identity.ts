// Only explicit namespaces are accepted. A bare numeric ID is never inferred.
export const tmdbIdFrom = (id: string): number | null => {
    if (!/^tmdb:[1-9]\d{0,15}$/.test(id)) return null;
    const value = Number(id.slice(5));
    return Number.isSafeInteger(value) ? value : null;
};

export const isSupportedMediaId = (id: string): boolean => /^tt\d{7,10}$/.test(id) || tmdbIdFrom(id) !== null;
