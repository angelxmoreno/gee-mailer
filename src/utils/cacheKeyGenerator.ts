export const cacheKeyGenerator = (keys: unknown[]): string => {
    const hasher = new Bun.CryptoHasher('sha256');
    return hasher.update(keys.join('::')).digest('hex');
};
