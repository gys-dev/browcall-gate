export interface WSPayload<T> {
    type: string;
    data?: T;
}
