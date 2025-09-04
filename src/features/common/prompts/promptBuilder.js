const { profilePrompts } = require('./promptTemplates.js');

function buildSystemPrompt(promptParts, context = {}, googleSearchEnabled = true) {
    let finalFormatRequirements = promptParts.formatRequirements;

    if (context.existing_definitions) {
        finalFormatRequirements = finalFormatRequirements.replace('{existing_definitions}', context.existing_definitions);
    }

    const sections = [promptParts.intro, '\n\n', finalFormatRequirements];

    if (googleSearchEnabled && promptParts.searchUsage) {
        sections.push('\n\n', promptParts.searchUsage);
    }

    // Add content section if it exists
    if (promptParts.content && promptParts.content.trim()) {
        sections.push('\n\n', promptParts.content);

        // Only add context section if we have meaningful conversation context
        if (context.context && context.context.trim()) {
            sections.push('\n\nConversation context\n-----\n', context.context, '\n-----\n\n');
        } else {
            sections.push('\n\n');
        }
    } else {
        // For prompts without content (like define), skip context section entirely
        sections.push('\n\n');
    }

    sections.push(promptParts.outputInstructions);

    return sections.join('');
}

function getSystemPrompt(profile, context, googleSearchEnabled = true) {
    const promptParts = profilePrompts[profile] || profilePrompts.interview;
    const promptContext = typeof context === 'string' ? { context } : context || {};
    return buildSystemPrompt(promptParts, promptContext, googleSearchEnabled);
}

module.exports = {
    getSystemPrompt,
};
