// jsdom has no layout, so it has no IntersectionObserver. This one reports an element as
// visible only when a test calls `scrollIntoView`.

const observers = new Set<FakeIntersectionObserver>();

class FakeIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly scrollMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    private readonly targets = new Set<Element>();

    constructor(private readonly callback: IntersectionObserverCallback) {
        observers.add(this);
    }

    observe(target: Element) {
        this.targets.add(target);
    }

    unobserve(target: Element) {
        this.targets.delete(target);
    }

    disconnect() {
        this.targets.clear();
        observers.delete(this);
    }

    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }

    reveal(target: Element) {
        if (!this.targets.has(target)) return;
        const rect = target.getBoundingClientRect();
        this.callback(
            [{ target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: rect, intersectionRect: rect, rootBounds: null, time: 0 }],
            this
        );
    }
}

export const installIntersectionObserver = () => {
    globalThis.IntersectionObserver = FakeIntersectionObserver;
};

/** Tells every observer watching `target` that it scrolled into view. */
export const scrollIntoView = (target: Element) => {
    observers.forEach(observer => observer.reveal(target));
};
