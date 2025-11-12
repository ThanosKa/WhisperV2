const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../src/window/windowManager', () => ({
    windowPool: new Map(),
}));

jest.mock('../../../src/features/common/config/config', () => ({
    get: jest.fn(key => {
        if (key === 'utteranceSilenceMs') return 800;
        if (key === 'maxUtteranceChars') return 50;
        return undefined;
    }),
}));

jest.mock('../../../src/features/common/services/authService', () => ({}));

const SttService = require('../../../src/features/listen/stt/sttService');

describe('SttService utterance segmentation', () => {
    let service;

    beforeEach(() => {
        service = new SttService();
        service.sendToRenderer = jest.fn();
        service.onTranscriptionComplete = jest.fn();
    });

    test('forces splits when partial text exceeds configured limit', () => {
        const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);

        const remainder = service._handlePartialSegmentation({
            speakerLabel: 'Me',
            textChunk: longText,
            committedKey: 'meCommittedLength',
        });

        expect(service.onTranscriptionComplete).toHaveBeenCalled();
        const emittedLengths = service.onTranscriptionComplete.mock.calls.map(([, text]) => text.length);
        emittedLengths.forEach(len => expect(len).toBeLessThanOrEqual(50));

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

        expect(service.onTranscriptionComplete).not.toHaveBeenCalled();
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

        expect(service.onTranscriptionComplete).not.toHaveBeenCalled();
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

        expect(service.onTranscriptionComplete).toHaveBeenCalledTimes(4);
        service.onTranscriptionComplete.mock.calls.forEach(([, text]) => {
            expect(text.length).toBeLessThanOrEqual(50);
        });
        expect(remainder.length).toBeLessThanOrEqual(50);
        expect(service.meCommittedLength).toBe(chunk.length - remainder.length);
    });
});
