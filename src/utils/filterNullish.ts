/**
 * Creates a new object with null and undefined values removed
 */
export function filterNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const result: Partial<T> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (value != null) {
            (result as Record<string, unknown>)[key] = value;
        }
    }

    return result;
}

/**
 * Creates a new object with only the specified values removed
 */
export function filterValues<T extends Record<string, unknown>>(
    obj: T,
    valuesToFilter: unknown[] = [null, undefined]
): Partial<T> {
    const result: Partial<T> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (!valuesToFilter.includes(value)) {
            (result as Record<string, unknown>)[key] = value;
        }
    }

    return result;
}
