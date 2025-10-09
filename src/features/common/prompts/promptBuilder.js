const { profilePrompts } = require('./promptTemplates.js');

// Simple XML structure - pure transcription, full previous items
function buildXMLContext(previousItems, transcript) {
    const previousXML =
        previousItems && previousItems.length > 0 ? `<previous>\n${previousItems.join('\n')}\n</previous>` : '<previous>\n(none)\n</previous>';

    const transcriptionXML = `<transcription>\n${transcript || ''}\n</transcription>`;

    return `${previousXML}\n\n${transcriptionXML}`;
}

function buildSystemPrompt(promptParts, context = {}, googleSearchEnabled = true) {
    // Simplified path: if a template provides a single `system` string (markdown), use it as-is
    if (promptParts && typeof promptParts.system === 'string' && promptParts.system.trim().length > 0) {
        const systemText = promptParts.system.trim();

        // Fallback to old string context for non-analysis prompts
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

    // Handle new XML structure for analysis profiles and comprehensive summary
    if (context && typeof context === 'object' && context.transcript) {
        // For comprehensive summary, include transcription in system prompt
        if (profile === 'comprehensive_summary') {
            const transcriptionXML = `<transcription>\n${context.transcript || ''}\n</transcription>`;
            // Return object with system prompt including transcription, and simple user instruction
            return {
                system: `${promptParts.system}\n\n${transcriptionXML}`,
                user: 'Please analyze and summarize the conversation in the transcription above.',
            };
        }
        // Pass full previous items array instead of categorized strings for analysis profiles
        const previousItems = context.previousItems || [];
        const xmlContext = buildXMLContext(previousItems, context.transcript);
        const builtPrompt = `${promptParts.system}\n\n${xmlContext}`;
        // console.log(`[PromptBuilder] Built XML prompt for profile '${profile}': ${builtPrompt.substring(0, 300)}...`);
        return builtPrompt;
    }

    // Fallback to old string context
    const promptContext = typeof context === 'string' ? { context } : context || {};
    const builtPrompt = buildSystemPrompt(promptParts, promptContext, googleSearchEnabled);
    // console.log(`[PromptBuilder] Built prompt for profile '${profile}': ${builtPrompt.substring(0, 200)}...`); // Debug log (truncate for brevity)
    return builtPrompt;
}

module.exports = {
    getSystemPrompt,
};
