'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { getPresets, updatePreset, PromptPreset } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_ORIGINALS = {
    Brainstorm: 'You are a creative assistant.',
    Summarize: 'Summarize the following content',
    'Code Review': 'Review the code and suggest improvements',
};

export default function PersonalizePage() {
    const [allPresets, setAllPresets] = useState<PromptPreset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
    const [showPresets, setShowPresets] = useState(true);
    const [savedContent, setSavedContent] = useState(''); // What's in the gray area
    const [newContent, setNewContent] = useState(''); // What user is typing
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    // Modal states - only keep reset confirm
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const MAX_CHARS = 2000;
    const fullContent = savedContent + newContent;
    const isOverLimit = fullContent.length > MAX_CHARS;
    const canSave = newContent.trim() && !isOverLimit && !saving;

    // Check if there's appended content to reset (compare saved vs original)
    const canReset = !!selectedPreset?.append_text && !saving;

    const filteredPresets = useMemo(() => {
        if (!searchTerm.trim()) return allPresets;
        return allPresets.filter(
            preset => preset.title.toLowerCase().includes(searchTerm.toLowerCase()) || preset.prompt.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [allPresets, searchTerm]);

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
        <div className="flex h-full bg-gray-50">
            {/* Sidebar */}
            <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${showPresets ? 'w-96' : 'w-16'}`}>
                <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {showPresets && (
                                <>
                                    <h2 className="text-lg font-semibold text-gray-900">Presets</h2>
                                    <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{filteredPresets.length}</span>
                                </>
                            )}
                        </div>
                        <Button onClick={() => setShowPresets(!showPresets)} variant="ghost" size="sm" className="p-2">
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showPresets ? 'rotate-90' : '-rotate-90'}`} />
                        </Button>
                    </div>

                    {showPresets && (
                        <div className="mt-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search presets..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-10"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {showPresets && (
                        <div className="p-2">
                            {filteredPresets.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    {searchTerm ? 'No presets match your search' : 'No presets found'}
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {filteredPresets.map(preset => (
                                        <div
                                            key={preset.id}
                                            onClick={() => selectPreset(preset)}
                                            className={`
                                                p-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-50
                                                ${
                                                    selectedPreset?.id === preset.id
                                                        ? 'bg-blue-50 border border-blue-200 shadow-sm'
                                                        : 'bg-white border border-gray-100 hover:border-gray-200'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-medium text-gray-900 text-sm truncate">{preset.title}</h3>
                                                    {preset.is_default === 1 && (
                                                        <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                {preset.prompt.substring(0, 120) + (preset.prompt.length > 120 ? '...' : '')}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {showPresets && <div className="p-4 border-t border-gray-100">{/* No action buttons for create/duplicate/delete */}</div>}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                <div className="bg-white border-b border-gray-200 px-8 py-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{selectedPreset ? selectedPreset.title : 'Personalize'}</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                {selectedPreset ? 'Add your custom instructions below' : 'Select a preset to customize'}
                            </p>
                        </div>
                        <div className="flex gap-2 items-center">
                            <div className="text-sm px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                                {fullContent.length}/{MAX_CHARS}
                            </div>
                            <Button onClick={() => setShowResetConfirm(true)} disabled={!canReset} variant="outline" size="sm">
                                Reset
                            </Button>
                            <Button onClick={handleSave} disabled={!canSave} variant={canSave ? 'default' : 'secondary'}>
                                {saving ? 'Saving...' : canSave ? 'Save' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white p-8">
                    <div className="h-full rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        {/* Saved Content - Gray Area */}
                        <div className="bg-gray-50 p-6 border-b border-gray-200 min-h-[40%] max-h-[60%] overflow-y-auto">
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">{savedContent || 'No content yet'}</div>
                        </div>

                        {/* New Content - White Area */}
                        <div className="flex-1">
                            <textarea
                                value={newContent}
                                onChange={e => setNewContent(e.target.value)}
                                className={`w-full h-full p-6 text-base border-0 resize-none focus:outline-none bg-white leading-relaxed ${
                                    isOverLimit ? 'text-red-900' : 'text-gray-900'
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
