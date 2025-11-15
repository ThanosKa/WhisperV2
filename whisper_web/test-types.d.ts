// Type declarations for test environment globals

declare global {
    interface Window {
        __intersectionObserverInstances?: Array<{ callback: IntersectionObserverCallback }>;
    }

    namespace NodeJS {
        interface Global {
            __intersectionObserverInstances?: Array<{ callback: IntersectionObserverCallback }>;
        }
    }
}

export {};

