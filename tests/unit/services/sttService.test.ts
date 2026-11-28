import { beforeEach, describe, expect, test, vi } from 'vitest';
import SttService from '../../../src/main/features/listen/stt/sttService';

vi.mock('../../../src/main/window/windowManager', () => ({
    windowPool: new Map(),
}));

vi.mock('../../../src/main/features/common/config/config', () => ({
    default: {
        get: vi.fn((key: string) => {
            if (key === 'utteranceSilenceMs') return 800;
            if (key === 'maxUtteranceChars') return 50;
            return undefined;
        }),
    },
}));

vi.mock('../../../src/main/features/common/services/authService', () => ({ default: {} }));

describe('SttService utterance segmentation', () => {
    let service: SttService;
    const onTranscriptionComplete = vi.fn((_utterance: { speaker: string; text: string }) => undefined);

    beforeEach(() => {
        service = new SttService();
        service.sendToRenderer = vi.fn();
        service.setCallbacks({ onTranscriptionComplete, onStatusUpdate: vi.fn(), onQuotaExceeded: vi.fn() });
    });

    test('forces splits when partial text exceeds configured limit', () => {
        const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);

        const remainder = service._handlePartialSegmentation({
            speakerLabel: 'Me',
            textChunk: longText,
            committedKey: 'meCommittedLength',
        });

        expect(onTranscriptionComplete).toHaveBeenCalled();
        const emittedLengths = onTranscriptionComplete.mock.calls.map(([{ text }]) => text.length);
        emittedLengths.forEach((len: number) => expect(len).toBeLessThanOrEqual(50));

        expect(remainder.length).toBeLessThanOrEqual(50);
        expect(service.meCommittedLength).toBe(longText.length - remainder.length);
    });

    test('returns untouched text when below limit', () => {
        const shortText = 'Short message stays partial';

        const remainder = service._handlePartialSegmentation({
            speakerLabel: 'Me',
            textChunk: shortText,
            committedKey: 'meCommittedLength',
        });

        expect(onTranscriptionComplete).not.toHaveBeenCalled();
        expect(remainder).toBe(shortText);
        expect(service.meCommittedLength).toBe(0);
    });

    test('handles single-character partial without emitting final utterance', () => {
        const shortText = 'a';

        const remainder = service._handlePartialSegmentation({
            speakerLabel: 'Them',
            textChunk: shortText,
            committedKey: 'themCommittedLength',
        });

        expect(onTranscriptionComplete).not.toHaveBeenCalled();
        expect(remainder).toBe(shortText);
        expect(service.themCommittedLength).toBe(0);
    });

    test('splits deterministic long text into multiple utterances', () => {
        const chunk = 'x'.repeat(250);

        const remainder = service._handlePartialSegmentation({
            speakerLabel: 'Me',
            textChunk: chunk,
            committedKey: 'meCommittedLength',
        });

        expect(onTranscriptionComplete).toHaveBeenCalledTimes(4);
        onTranscriptionComplete.mock.calls.forEach(([{ text }]) => {
            expect(text.length).toBeLessThanOrEqual(50);
        });
        expect(remainder.length).toBeLessThanOrEqual(50);
        expect(service.meCommittedLength).toBe(chunk.length - remainder.length);
    });
});
