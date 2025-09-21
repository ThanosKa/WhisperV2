'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, Plus, Copy, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputDialog } from '@/components/ui/input-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { getPresets, updatePreset, createPreset, deletePreset, PromptPreset } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

export default function PersonalizePage() {
    const [allPresets, setAllPresets] = useState<PromptPreset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
    const [showPresets, setShowPresets] = useState(true);
    const [editorContent, setEditorContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    // Role editor limit
    const MAX_CHARS = 2000;

    // Filter presets based on search term
    const filteredPresets = useMemo(() => {
        if (!searchTerm.trim()) return allPresets;
        return allPresets.filter(
            preset => preset.title.toLowerCase().includes(searchTerm.toLowerCase()) || preset.prompt.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [allPresets, searchTerm]);

    // Check if exceeding character limit
    const isOverLimit = editorContent.length > MAX_CHARS;

    // Modal state for creating/duplicating presets
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [modalType, setModalType] = useState<'create' | 'duplicate'>('create');
    const [duplicatePresetName, setDuplicatePresetName] = useState('');

    // Confirm dialogs
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [pendingPreset, setPendingPreset] = useState<PromptPreset | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
        if (isDirty) {
            setPendingPreset(preset);
            setShowUnsavedConfirm(true);
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

        // Prevent saving if over character limit
        if (editorContent.length > MAX_CHARS) {
            return;
        }

        try {
            setSaving(true);
            await updatePreset(selectedPreset.id, {
                title: selectedPreset.title,
                prompt: editorContent,
            });

            setAllPresets(prev => prev.map(p => (p.id === selectedPreset.id ? { ...p, prompt: editorContent } : p)));
            setIsDirty(false);

            toast({
                title: 'Preset saved',
            });
        } catch (error) {
            console.error('Save failed:', error);
            toast({
                title: 'Error',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCreateNewPreset = () => {
        setModalType('create');
        setDuplicatePresetName('');
        setShowPresetModal(true);
    };

    const handleCreatePresetConfirm = async (title: string) => {
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

            toast({
                title: 'Preset created',
            });
        } catch (error) {
            console.error('Failed to create preset:', error);
            toast({
                title: 'Error',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicatePreset = () => {
        if (!selectedPreset) return;

        setModalType('duplicate');
        setDuplicatePresetName(`${selectedPreset.title} (Copy)`);
        setShowPresetModal(true);
    };

    const handleDuplicatePresetConfirm = async (title: string) => {
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

            toast({
                title: 'Preset duplicated',
            });
        } catch (error) {
            console.error('Failed to duplicate preset:', error);
            toast({
                title: 'Error',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDeletePreset = async () => {
        if (!selectedPreset || selectedPreset.is_default === 1 || saving) return;
        try {
            setSaving(true);
            await deletePreset(selectedPreset.id);
            setAllPresets(prev => prev.filter(p => p.id !== selectedPreset.id));
            const remaining = allPresets.filter(p => p.id !== selectedPreset.id);
            const next = remaining.find(p => p.title === 'Personal') || remaining[0] || null;
            setSelectedPreset(next);
            setEditorContent(next ? next.prompt : '');
            setIsDirty(false);

            toast({
                title: 'Preset deleted',
            });
        } catch (error) {
            console.error('Failed to delete preset:', error);
            toast({
                title: 'Error',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
            setShowDeleteConfirm(false);
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
                {/* Sidebar Header */}
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

                {/* Preset List */}
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
                                            onClick={() => handlePresetClick(preset)}
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

                {/* Sidebar Actions */}
                {showPresets && (
                    <div className="p-4 border-t border-gray-100">
                        <div className="flex gap-2">
                            <Button onClick={handleCreateNewPreset} disabled={saving} size="sm" className="flex-1">
                                <Plus className="h-4 w-4 mr-2" />
                                New
                            </Button>
                            {selectedPreset && (
                                <Button onClick={handleDuplicatePreset} disabled={saving} variant="outline" size="sm" className="flex-1">
                                    <Copy className="h-4 w-4 mr-2" />
                                    Duplicate
                                </Button>
                            )}
                        </div>
                        {selectedPreset && selectedPreset.is_default === 0 && (
                            <Button
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={saving}
                                variant="destructive"
                                size="sm"
                                className="w-full mt-2"
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-8 py-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{selectedPreset ? selectedPreset.title : 'Personalize'}</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                {selectedPreset ? 'Edit your preset role and behavior' : 'Select a preset to customize'}
                            </p>
                        </div>
                        <Button
                            onClick={handleSave}
                            disabled={saving || !isDirty || editorContent.length > MAX_CHARS}
                            variant={!isDirty && !saving ? 'secondary' : 'default'}
                        >
                            {!isDirty && !saving ? 'Saved' : saving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>

                {/* Role Editor */}
                <div className="flex-1 bg-white p-8">
                    <div className="mb-4">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">Role</h3>
                            <div className="text-sm px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                                {editorContent.length}/{MAX_CHARS} chars
                            </div>
                        </div>
                        <p className="text-sm text-gray-600">Describe the assistant's role and behavior for this preset</p>
                        {isOverLimit && <p className="text-sm text-yellow-600 mt-1">⚠️ Role description exceeds {MAX_CHARS} characters.</p>}
                    </div>
                    <div className="h-[calc(100%-8rem)] rounded-lg border border-gray-200 bg-white shadow-sm">
                        <textarea
                            value={editorContent}
                            onChange={handleEditorChange}
                            className={`w-full h-full p-6 text-base border-0 resize-none focus:outline-none bg-white leading-relaxed ${
                                isOverLimit ? 'text-red-900' : 'text-gray-900'
                            }`}
                            placeholder="Describe the assistant's role for this preset (e.g., 'You are a senior software engineer specializing in React and TypeScript...')"
                            readOnly={false}
                        />
                    </div>
                </div>
            </div>

            {/* Create/Duplicate Preset dialog */}
            <InputDialog
                open={showPresetModal}
                onOpenChange={setShowPresetModal}
                title={modalType === 'create' ? 'Create New Preset' : 'Duplicate Preset'}
                description={modalType === 'create' ? 'Enter a name for your new preset.' : 'Enter a name for the duplicated preset.'}
                defaultValue={duplicatePresetName}
                placeholder={modalType === 'create' ? 'Enter preset name...' : `${selectedPreset?.title} (Copy)`}
                confirmLabel={modalType === 'create' ? 'Create Preset' : 'Duplicate'}
                onConfirm={modalType === 'create' ? handleCreatePresetConfirm : handleDuplicatePresetConfirm}
                onCancel={() => setShowPresetModal(false)}
                loading={saving}
            />

            {/* Unsaved changes confirm */}
            <ConfirmDialog
                open={showUnsavedConfirm}
                onOpenChange={setShowUnsavedConfirm}
                title="Unsaved Changes"
                description="You have unsaved changes. Switch presets without saving?"
                confirmLabel="Switch"
                cancelLabel="Stay"
                onConfirm={() => {
                    if (pendingPreset) {
                        setSelectedPreset(pendingPreset);
                        setEditorContent(pendingPreset.prompt);
                        setIsDirty(false);
                        setPendingPreset(null);
                    }
                    setShowUnsavedConfirm(false);
                }}
            />

            {/* Delete preset confirm */}
            <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title="Delete Preset"
                description={selectedPreset ? `Delete preset "${selectedPreset.title}"? This cannot be undone.` : 'Delete this preset?'}
                confirmLabel={saving ? 'Deleting...' : 'Delete'}
                cancelLabel="Cancel"
                variant="destructive"
                loading={saving}
                onConfirm={handleDeletePreset}
            />
        </div>
    );
}
