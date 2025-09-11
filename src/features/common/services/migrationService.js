// Migration service disabled - Firebase migration not needed for webapp authentication approach
// This file is kept as a placeholder to prevent import errors

async function checkAndRunMigration(user) {
    // Migration disabled - using local-first data strategy with webapp authentication
    console.log('[Migration] Migration service disabled - using local-first data strategy');
    return;
}

module.exports = {
    checkAndRunMigration,
};
