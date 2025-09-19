'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Plus, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPresets, updatePreset, createPreset, deletePreset, PromptPreset } from '@/utils/api';

export default function PersonalizePage() {
    const [allPresets, setAllPresets] = useState<PromptPreset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
    const [showPresets, setShowPresets] = useState(true);
    const [editorContent, setEditorContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const presetsData = await getPresets();
                setAllPresets(presetsData);

                if (presetsData.length > 0) {
                    const firstPreset = presetsData.find(p => p.title === 'Personal') || presetsData[0];
                    setSelectedPreset(firstPreset);
                    setEditorContent(firstPreset.prompt);
                }
            } catch (error) {
                console.error('Failed to fetch presets:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handlePresetClick = (preset: PromptPreset) => {
        if (isDirty && !window.confirm('You have unsaved changes. Are you sure you want to switch?')) {
            return;
        }
        setSelectedPreset(preset);
        setEditorContent(preset.prompt);
        setIsDirty(false);
    };

    const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditorContent(e.target.value);
        setIsDirty(true);
    };

    const handleSave = async () => {
        if (!selectedPreset || saving || !isDirty) return;

        try {
            setSaving(true);
            await updatePreset(selectedPreset.id, {
                title: selectedPreset.title,
                prompt: editorContent,
            });

            setAllPresets(prev => prev.map(p => (p.id === selectedPreset.id ? { ...p, prompt: editorContent } : p)));
            setIsDirty(false);
        } catch (error) {
            console.error('Save failed:', error);
            alert('Failed to save preset. See console for details.');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateNewPreset = async () => {
        const title = prompt('Enter a title for the new preset:');
        if (!title) return;

        try {
            setSaving(true);
            const { id } = await createPreset({
                title,
                prompt: '',
            });

            const newPreset: PromptPreset = {
                id,
                uid: 'current_user',
                title,
                prompt: '',
                is_default: 0,
                created_at: Date.now(),
                sync_state: 'clean',
            };

            setAllPresets(prev => [...prev, newPreset]);
            setSelectedPreset(newPreset);
            setEditorContent(newPreset.prompt);
            setIsDirty(false);
        } catch (error) {
            console.error('Failed to create preset:', error);
            alert('Failed to create preset. See console for details.');
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicatePreset = async () => {
        if (!selectedPreset) return;

        const title = prompt('Enter a title for the duplicated preset:', `${selectedPreset.title} (Copy)`);
        if (!title) return;

        try {
            setSaving(true);
            const { id } = await createPreset({
                title,
                prompt: editorContent,
            });

            const newPreset: PromptPreset = {
                id,
                uid: 'current_user',
                title,
                prompt: editorContent,
                is_default: 0,
                created_at: Date.now(),
                sync_state: 'clean',
            };

            setAllPresets(prev => [...prev, newPreset]);
            setSelectedPreset(newPreset);
            setIsDirty(false);
        } catch (error) {
            console.error('Failed to duplicate preset:', error);
            alert('Failed to duplicate preset. See console for details.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeletePreset = async () => {
        if (!selectedPreset || selectedPreset.is_default === 1 || saving) return;
        const confirmed = window.confirm(`Delete preset "${selectedPreset.title}"? This cannot be undone.`);
        if (!confirmed) return;
        try {
            setSaving(true);
            await deletePreset(selectedPreset.id);
            setAllPresets(prev => prev.filter(p => p.id !== selectedPreset.id));
            const remaining = allPresets.filter(p => p.id !== selectedPreset.id);
            const next = remaining.find(p => p.title === 'Personal') || remaining[0] || null;
            setSelectedPreset(next);
            setEditorContent(next ? next.prompt : '');
            setIsDirty(false);
        } catch (error) {
            console.error('Failed to delete preset:', error);
            alert('Failed to delete preset. See console for details.');
        } finally {
            setSaving(false);
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
        <div className="flex flex-col h-full">
            <div className="bg-white border-b border-gray-100">
                <div className="px-8 pt-8 pb-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-500 mb-2">Presets</p>
                            <h1 className="text-3xl font-bold text-gray-900">Personalize</h1>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleCreateNewPreset} disabled={saving} className="flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                {saving ? 'Creating...' : 'New Preset'}
                            </Button>
                            {selectedPreset && (
                                <>
                                    <Button onClick={handleDuplicatePreset} disabled={saving} variant="secondary" className="flex items-center gap-2">
                                        <Copy className="h-4 w-4" />
                                        {saving ? 'Duplicating...' : 'Duplicate'}
                                    </Button>
                                    {selectedPreset.is_default === 0 && (
                                        <Button
                                            onClick={handleDeletePreset}
                                            disabled={saving}
                                            variant="destructive"
                                            className="flex items-center gap-2"
                                        >
                                            Delete
                                        </Button>
                                    )}
                                </>
                            )}
                            <Button onClick={handleSave} disabled={saving || !isDirty} variant={!isDirty && !saving ? 'secondary' : 'default'}>
                                {!isDirty && !saving ? 'Saved' : saving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`transition-colors duration-300 ${showPresets ? 'bg-gray-50' : 'bg-white'}`}>
                <div className="px-8 py-6">
                    <div className="mb-6">
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
                        <div className="grid grid-cols-5 gap-4 mb-6">
                            {allPresets.map(preset => (
                                <div
                                    key={preset.id}
                                    onClick={() => handlePresetClick(preset)}
                                    className={`
                    p-4 rounded-lg cursor-pointer transition-all duration-200 bg-white
                    h-48 flex flex-col shadow-sm hover:shadow-md relative
                    ${selectedPreset?.id === preset.id ? 'border-2 border-blue-500 shadow-md' : 'border border-gray-200 hover:border-gray-300'}
                  `}
                                >
                                    {preset.is_default === 1 && (
                                        <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                                            Default
                                        </div>
                                    )}
                                    <h3 className="font-semibold text-gray-900 mb-3 text-center text-sm">{preset.title}</h3>
                                    <p className="text-xs text-gray-600 leading-relaxed flex-1 overflow-hidden">
                                        {preset.prompt.substring(0, 100) + (preset.prompt.length > 100 ? '...' : '')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-white">
                <div className="h-full px-8 py-6">
                    <div className="mb-2 text-sm text-gray-600">Role</div>
                    <div className="h-[calc(100%-2rem)] rounded-lg border border-gray-200 bg-white shadow-sm">
                        <textarea
                            value={editorContent}
                            onChange={handleEditorChange}
                            className="w-full h-full p-4 text-sm text-gray-900 border-0 resize-none focus:outline-none bg-white font-mono leading-relaxed"
                            placeholder="Describe the assistant's role for this analysis preset (e.g., 'You are a ...')"
                            readOnly={false}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
