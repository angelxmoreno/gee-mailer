import inflection from 'inflection';

/**
 * Converts a string to snake_case while properly handling acronyms.
 *
 * This function ensures that acronyms like "API", "HTML", "XML" are converted
 * correctly to snake_case without creating awkward separations.
 *
 * @param str - The string to convert
 * @returns The snake_case string
 *
 * @example
 * ```typescript
 * toSnakeCaseAcronymSafe('UserAPIKey') // returns 'user_api_key'
 * toSnakeCaseAcronymSafe('HTTPSConnection') // returns 'https_connection'
 * toSnakeCaseAcronymSafe('XMLParser') // returns 'xml_parser'
 * ```
 */
export function toSnakeCaseAcronymSafe(str: string): string {
    return str
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase();
}
/**
 * Creates a safe table name from an entity class name.
 *
 * This function strips the "Entity" suffix (if present), converts to snake_case,
 * and pluralizes the result for database table naming conventions.
 *
 * @param targetName - The entity class name
 * @returns The pluralized, snake_case table name
 *
 * @example
 * ```typescript
 * createSafeTableName('UserEntity') // returns 'users'
 * createSafeTableName('BlogPost') // returns 'blog_posts'
 * createSafeTableName('APIKey') // returns 'api_keys'
 * ```
 */
export function createSafeTableName(targetName: string): string {
    // strip a trailing "Entity" only
    const stripped = targetName.replace(/Entity$/, '');
    const snake = toSnakeCaseAcronymSafe(stripped);
    return inflection.pluralize(snake);
}
