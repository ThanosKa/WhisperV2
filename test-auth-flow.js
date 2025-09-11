// Test script to verify authentication flow
const fetch = require('node-fetch');

async function testAuthFlow() {
    console.log('🧪 Testing Authentication Flow...\n');

    const WEBAPP_CONFIG = {
        domain: 'http://localhost:3000',
        sessionInitUrl: 'http://localhost:3000/api/auth/session/init',
        sessionStatusUrl: 'http://localhost:3000/api/auth/session',
        sessionPageUrl: 'http://localhost:3000/session',
    };

    try {
        // 1. Test if webapp is running
        console.log('1. Testing webapp connection...');
        const healthResponse = await fetch(`${WEBAPP_CONFIG.domain}/`, {
            timeout: 5000,
        });

        if (healthResponse.ok) {
            console.log('✅ Webapp is running');
        } else {
            console.log('❌ Webapp returned status:', healthResponse.status);
            return;
        }

        // 2. Test session initialization
        console.log('\n2. Testing session initialization...');
        const initResponse = await fetch(WEBAPP_CONFIG.sessionInitUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (initResponse.ok) {
            const initData = await initResponse.json();
            console.log('✅ Session initialization successful:', initData);

            if (initData.success && initData.data?.session_uuid) {
                const sessionUuid = initData.data.session_uuid;

                // 3. Test session status
                console.log('\n3. Testing session status...');
                const statusResponse = await fetch(`${WEBAPP_CONFIG.sessionStatusUrl}/${sessionUuid}`);

                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    console.log('✅ Session status check successful:', statusData);
                } else {
                    console.log('❌ Session status check failed:', statusResponse.status);
                }

                // 4. Test user profile endpoint (should fail since no authentication)
                console.log('\n4. Testing user profile endpoint...');
                const profileResponse = await fetch(`${WEBAPP_CONFIG.domain}/api/auth/user-by-session/${sessionUuid}`);

                if (profileResponse.ok) {
                    const profileData = await profileResponse.json();
                    console.log('✅ User profile endpoint responded:', profileData);
                } else {
                    console.log('❌ User profile endpoint failed (expected for unauthenticated session):', profileResponse.status);
                }
            } else {
                console.log('❌ Session UUID not found in response');
            }
        } else {
            console.log('❌ Session initialization failed:', initResponse.status);
        }
    } catch (error) {
        console.log('❌ Test failed with error:', error.message);

        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 It looks like the webapp is not running.');
            console.log('   Please start the webapp first before running this test.');
        }
    }
}

if (require.main === module) {
    testAuthFlow();
}

module.exports = { testAuthFlow };
