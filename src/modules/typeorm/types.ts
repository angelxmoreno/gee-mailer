interface ObjectLiteral {
    [key: string]: string | number | Date | null;
}

export type QueryDeepPartialEntity<T> = _QueryDeepPartialEntity<ObjectLiteral extends T ? unknown : T>;
export type _QueryDeepPartialEntity<T> = {
    [P in keyof T]?:
        | (T[P] extends Array<infer U>
              ? Array<_QueryDeepPartialEntity<U>>
              : T[P] extends ReadonlyArray<infer U>
                ? ReadonlyArray<_QueryDeepPartialEntity<U>>
                : _QueryDeepPartialEntity<T[P]>)
        | (() => string);
};

export type PartialWithRequired<T, K extends keyof T> = Partial<T> & Required<Pick<T, K>>;
