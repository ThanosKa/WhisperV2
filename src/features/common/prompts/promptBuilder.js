const { profilePrompts } = require('./promptTemplates.js');

function buildSystemPrompt(promptParts, context = {}, googleSearchEnabled = true) {
    // New simplified path: if a template provides a single `system` string (markdown), use it as-is
    if (promptParts && typeof promptParts.system === 'string' && promptParts.system.trim().length > 0) {
        const systemText = promptParts.system.trim();
        const ctxString = typeof context === 'string' ? context : context && typeof context.context === 'string' ? context.context : '';
        if (ctxString && ctxString.trim()) {
            return `${systemText}\n\n<Transcription>\n${ctxString.trim()}\n</Transcription>\n`;
        }
        return systemText;
    }

    // Legacy path: support existing split sections (intro/formatRequirements/content/...)
    let finalFormatRequirements = promptParts && typeof promptParts.formatRequirements === 'string' ? promptParts.formatRequirements : '';

    if (finalFormatRequirements && context && context.existing_definitions) {
        finalFormatRequirements = finalFormatRequirements.replace('{existing_definitions}', context.existing_definitions);
    }

    const sections = [];

    if (promptParts && typeof promptParts.intro === 'string' && promptParts.intro.trim()) {
        sections.push(promptParts.intro.trim());
    }

    if (finalFormatRequirements && finalFormatRequirements.trim()) {
        sections.push('\n\n', finalFormatRequirements.trim());
    }

    if (googleSearchEnabled && promptParts && typeof promptParts.searchUsage === 'string' && promptParts.searchUsage.trim()) {
        sections.push('\n\n', promptParts.searchUsage.trim());
    }

    if (promptParts && typeof promptParts.content === 'string' && promptParts.content.trim()) {
        sections.push('\n\n', promptParts.content.trim());
        const ctx = typeof context === 'string' ? context : context && typeof context.context === 'string' ? context.context : '';
        if (ctx && ctx.trim()) {
            sections.push('\n\nConversation context\n-----\n<Transcription>\n', ctx.trim(), '\n</Transcription>\n-----\n\n');
        } else {
            sections.push('\n\n');
        }
    } else {
        sections.push('\n\n');
    }

    if (promptParts && typeof promptParts.outputInstructions === 'string' && promptParts.outputInstructions.trim()) {
        sections.push(promptParts.outputInstructions.trim());
    }

    // Future: If template has json_schema, append strict JSON instruction
    if (promptParts && promptParts.json_schema) {
        sections.push(`\n\nRespond ONLY with valid JSON matching the schema—no other text.`);
    }

    return sections.join('');
}

function getSystemPrompt(profile, context, googleSearchEnabled = true) {
    const promptParts = profilePrompts[profile] || profilePrompts.whisper;
    const promptContext = typeof context === 'string' ? { context } : context || {};
    const builtPrompt = buildSystemPrompt(promptParts, promptContext, googleSearchEnabled);
    // console.log(`[PromptBuilder] Built prompt for profile '${profile}': ${builtPrompt.substring(0, 200)}...`); // Debug log (truncate for brevity)
    return builtPrompt;
}

module.exports = {
    getSystemPrompt,
};
