'use client';

// Backwards-compatible alias for the new generic InputDialog.
// Prefer importing InputDialog from '@/components/ui/input-dialog'.

import { InputDialog, type InputDialogProps } from '@/components/ui/input-dialog';

export interface PresetNameModalProps extends Omit<InputDialogProps, 'confirmLabel' | 'placeholder' | 'description'> {
    description: string;
    placeholder?: string;
}

export function PresetNameModal(props: PresetNameModalProps) {
    const { description, placeholder = 'Enter preset name...', ...rest } = props;
    return <InputDialog {...rest} description={description} placeholder={placeholder} confirmLabel={'Create Preset'} />;
}

export default PresetNameModal;
