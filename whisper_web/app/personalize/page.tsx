'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getPresets, updatePreset, PromptPreset } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

export default function PersonalizePage() {
    const [allPresets, setAllPresets] = useState<PromptPreset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
    const [showPresets, setShowPresets] = useState(true);
    const [savedContent, setSavedContent] = useState(''); // What's in the gray area
    const [newContent, setNewContent] = useState(''); // What user is typing
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    // Modal states - only keep reset confirm
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const MAX_CHARS = 2000;
    const fullContent = savedContent + newContent;
    const isOverLimit = fullContent.length > MAX_CHARS;
    const canSave = newContent.trim() && !isOverLimit && !saving;

    // Check if there's appended content to reset (compare saved vs original)
    const canReset = !!selectedPreset?.append_text && !saving;

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const presetsData = await getPresets();
                setAllPresets(presetsData);
                if (presetsData.length > 0) {
                    const firstPreset = presetsData[0];
                    selectPreset(firstPreset);
                }
            } catch (error) {
                console.error('Failed to fetch presets:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const selectPreset = (preset: PromptPreset) => {
        setSelectedPreset(preset);
        setSavedContent((preset.prompt || '') + (preset.append_text || ''));
        setNewContent('');
    };

    const handleSave = async () => {
        if (!canSave || !selectedPreset) return;

        try {
            setSaving(true);
            let updatedPreset: PromptPreset;
            if (selectedPreset.is_default === 1) {
                // For defaults, append to append_text
                await updatePreset(selectedPreset.id, {
                    title: selectedPreset.title,
                    append_text: newContent,
                });
                // Update local: add to append_text
                updatedPreset = { ...selectedPreset, append_text: newContent };
                setAllPresets(prev => prev.map(p => (p.id === selectedPreset.id ? updatedPreset : p)));
                setSelectedPreset(updatedPreset);
                setSavedContent(selectedPreset.prompt + newContent);
            } else {
                // For customs, full prompt update
                const updatedContent = savedContent + newContent;
                await updatePreset(selectedPreset.id, {
                    title: selectedPreset.title,
                    prompt: updatedContent,
                    append_text: '',
                });
                updatedPreset = { ...selectedPreset, prompt: updatedContent, append_text: '' };
                setAllPresets(prev => prev.map(p => (p.id === selectedPreset.id ? updatedPreset : p)));
                setSelectedPreset(updatedPreset);
                setSavedContent(updatedContent);
            }
            setNewContent('');
            toast({ title: 'Saved' });
        } catch (error) {
            console.error('Save failed:', error);
            toast({ title: 'Error saving', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleResetConfirm = async () => {
        if (!selectedPreset) return;

        try {
            setSaving(true);
            let updatedPreset: PromptPreset;
            if (selectedPreset.is_default === 1) {
                // Clear append_text for defaults
                await updatePreset(selectedPreset.id, {
                    title: selectedPreset.title,
                    append_text: '',
                });
                updatedPreset = { ...selectedPreset, append_text: '' };
                setAllPresets(prev => prev.map(p => (p.id === selectedPreset.id ? updatedPreset : p)));
                setSelectedPreset(updatedPreset);
                setSavedContent(selectedPreset.prompt);
            } else {
                // Clear prompt for customs
                await updatePreset(selectedPreset.id, {
                    title: selectedPreset.title,
                    prompt: '',
                    append_text: '',
                });
                updatedPreset = { ...selectedPreset, prompt: '', append_text: '' };
                setAllPresets(prev => prev.map(p => (p.id === selectedPreset.id ? updatedPreset : p)));
                setSelectedPreset(updatedPreset);
                setSavedContent('');
            }
            setNewContent(''); // Clear typing
            toast({ title: 'Reset complete' });
        } catch (error) {
            console.error('Reset failed:', error);
            toast({ title: 'Error resetting', variant: 'destructive' });
        } finally {
            setSaving(false);
            setShowResetConfirm(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Top Header */}
            <div className="bg-white border-b border-gray-200 px-8 pt-8 pb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500 mb-2">Presets</p>
                        <h1 className="text-3xl font-bold text-gray-900">{selectedPreset ? selectedPreset.title : 'Personalize'}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {selectedPreset ? 'Customize your instructions' : 'Select a preset to customize'}
                        </p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <div className={`text-sm px-2 py-1 rounded-full ${isOverLimit ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            {fullContent.length}/{MAX_CHARS}
                        </div>
                        <Button onClick={() => setShowResetConfirm(true)} disabled={!canReset} variant="outline" size="sm">
                            Reset
                        </Button>
                        <Button onClick={handleSave} disabled={!canSave} variant={canSave ? 'default' : 'secondary'}>
                            {saving ? 'Saving...' : canSave ? 'Save' : 'Saved'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Presets Section - Collapsible Grid */}
            <div className={`bg-white border-b border-gray-200 transition-all duration-300 ${showPresets ? 'pb-6' : ''}`}>
                <div className="px-8 py-6">
                    <div className="flex justify-between items-center mb-4">
                        <Button
                            onClick={() => setShowPresets(!showPresets)}
                            variant="ghost"
                            size="sm"
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
                        >
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showPresets ? 'rotate-180' : ''}`} />
                            {showPresets ? 'Hide Presets' : 'Show Presets'}
                        </Button>
                    </div>

                    {showPresets && (
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            {allPresets.length === 0 ? (
                                <div className="col-span-full text-center py-8 text-gray-500">No presets found</div>
                            ) : (
                                allPresets.map(preset => (
                                    <div
                                        key={preset.id}
                                        onClick={() => selectPreset(preset)}
                                        className={`
                                            p-4 rounded-lg cursor-pointer transition-all duration-200 bg-white
                                            h-48 flex flex-col shadow-sm hover:shadow-md relative
                                            ${
                                                selectedPreset?.id === preset.id
                                                    ? 'border-2 border-blue-500 shadow-md'
                                                    : 'border border-gray-200 hover:border-gray-300'
                                            }
                                        `}
                                    >
                                        {preset.is_default === 1 && (
                                            <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                                                Default
                                            </div>
                                        )}
                                        <h3 className="font-semibold text-gray-900 mb-3 text-center text-sm truncate">{preset.title}</h3>
                                        <p className="text-xs text-gray-600 leading-relaxed flex-1 overflow-hidden line-clamp-3">
                                            {preset.prompt.substring(0, 100) + (preset.prompt.length > 100 ? '...' : '')}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Editor Section */}
            <div className="flex-1 flex flex-col bg-white">
                <div className="px-8 py-6 border-b border-gray-200">
                    <div className="mb-2 text-sm text-gray-600">Role</div>
                </div>
                <div className="flex-1 px-8 pb-6 overflow-hidden">
                    <div className="h-full rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        {/* Saved Content - Gray Area */}
                        <div className="bg-gray-50 p-6 border-b border-gray-200 min-h-[40%] max-h-[60%] overflow-y-auto">
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                                {savedContent || 'No content yet'}
                            </div>
                        </div>

                        {/* New Content - White Area */}
                        <div className="flex-1 relative">
                            <textarea
                                value={newContent}
                                onChange={e => setNewContent(e.target.value)}
                                className={`w-full h-full p-6 text-sm text-gray-900 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-transparent bg-white font-mono leading-relaxed ${
                                    isOverLimit ? 'text-red-900' : ''
                                }`}
                                placeholder="Add your custom instructions here..."
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Reset Confirm */}
            <ConfirmDialog
                open={showResetConfirm}
                onOpenChange={setShowResetConfirm}
                title="Reset to Original"
                description="This will remove all your custom instructions and reset back to the original prompt. Continue?"
                confirmLabel={saving ? 'Resetting...' : 'Yes, Reset'}
                cancelLabel="No, Keep"
                variant="destructive"
                loading={saving}
                onConfirm={handleResetConfirm}
            />
        </div>
    );
}
