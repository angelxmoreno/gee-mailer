const hasher = new Bun.CryptoHasher('sha256');

export const cacheKeyGenerator = (keys: unknown[]): string => {
    return hasher.update(keys.join('::')).digest('hex');
};
