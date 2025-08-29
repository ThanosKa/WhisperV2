const { profilePrompts } = require('./promptTemplates.js');

function buildSystemPrompt(promptParts, customPrompt = '', googleSearchEnabled = true) {
    const sections = [promptParts.intro, '\n\n', promptParts.formatRequirements];

    if (googleSearchEnabled) {
        sections.push('\n\n', promptParts.searchUsage);
    }

    // Add content section if it exists
    if (promptParts.content && promptParts.content.trim()) {
        sections.push('\n\n', promptParts.content);

        // Only add context section if content exists (for prompts that need context)
        sections.push('\n\nUser-provided context\n-----\n', customPrompt, '\n-----\n\n');
    } else {
        // For prompts without content (like define), skip context section entirely
        sections.push('\n\n');
    }

    sections.push(promptParts.outputInstructions);

    return sections.join('');
}

function getSystemPrompt(profile, customPrompt = '', googleSearchEnabled = true) {
    const promptParts = profilePrompts[profile] || profilePrompts.interview;
    return buildSystemPrompt(promptParts, customPrompt, googleSearchEnabled);
}

module.exports = {
    getSystemPrompt,
};
