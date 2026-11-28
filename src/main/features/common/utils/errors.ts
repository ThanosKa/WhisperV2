// A caught value is `unknown`: anything can be thrown. This reads the message the old code read
// with `error.message`.
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
