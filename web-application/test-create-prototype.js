#!/usr/bin/env node

/**
 * Test script for the Create Prototype API
 * 
 * This script demonstrates how to:
 * 1. Create a new prototype
 * 2. Fork an existing prototype
 * 3. Handle different response types
 * 
 * Usage:
 * node test-create-prototype.js
 */

const API_BASE_URL = 'http://localhost:3000';
const JWT_TOKEN = 'your_jwt_token_here'; // Replace with actual token

async function testCreatePrototype() {
    console.log('🧪 Testing Create Prototype API...\n');

    // Test 1: Create new prototype
    console.log('📝 Test 1: Creating new prototype');
    try {
        const response = await fetch(`${API_BASE_URL}/api/create-prototype`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JWT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Test App',
                description: 'A test React Native app',
                visibility: 'PUBLIC'
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ Success! New prototype created:');
            console.log(`   Prototype ID: ${result.data.prototype_id}`);
            console.log(`   Viewing URL: ${result.data.viewing_url}`);

            // Store prototype ID for forking test
            global.testPrototypeId = result.data.prototype_id;
        } else {
            console.log('❌ Failed to create prototype:');
            console.log(`   Error: ${result.error}`);
            console.log(`   Message: ${result.message}`);
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Fork existing prototype (if we have one)
    if (global.testPrototypeId) {
        console.log('🔀 Test 2: Forking existing prototype');
        try {
            const response = await fetch(`${API_BASE_URL}/api/create-prototype`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${JWT_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: 'Forked Test App',
                    description: 'A fork of the test app',
                    prototype_id: global.testPrototypeId,
                    visibility: 'PUBLIC'
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log('✅ Success! Prototype forked:');
                console.log(`   New Prototype ID: ${result.data.prototype_id}`);
                console.log(`   Viewing URL: ${result.data.viewing_url}`);
            } else {
                console.log('❌ Failed to fork prototype:');
                console.log(`   Error: ${result.error}`);
                console.log(`   Message: ${result.message}`);
            }
        } catch (error) {
            console.log('❌ Request failed:', error.message);
        }
    } else {
        console.log('⏭️  Skipping fork test (no prototype ID available)');
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Test without authentication
    console.log('🚫 Test 3: Testing without authentication');
    try {
        const response = await fetch(`${API_BASE_URL}/api/create-prototype`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Unauthorized Test',
                description: 'This should fail'
            })
        });

        const result = await response.json();

        if (response.status === 401) {
            console.log('✅ Correctly rejected unauthorized request:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Error: ${result.error}`);
            console.log(`   Message: ${result.message}`);
        } else {
            console.log('❌ Unexpected response for unauthorized request:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response:`, result);
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 4: Test with invalid data
    console.log('📋 Test 4: Testing with invalid data (missing name)');
    try {
        const response = await fetch(`${API_BASE_URL}/api/create-prototype`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JWT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: 'Missing name field'
            })
        });

        const result = await response.json();

        if (response.status === 400) {
            console.log('✅ Correctly rejected invalid request:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Error: ${result.error}`);
            console.log(`   Message: ${result.message}`);
        } else {
            console.log('❌ Unexpected response for invalid request:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response:`, result);
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n🎉 Testing complete!');
}

// Run the tests
if (require.main === module) {
    if (JWT_TOKEN === 'your_jwt_token_here') {
        console.log('⚠️  Please update the JWT_TOKEN variable with a valid token before running tests.');
        console.log('   You can get a token by logging into your application and checking the browser console.');
        process.exit(1);
    }

    testCreatePrototype().catch(console.error);
}

module.exports = { testCreatePrototype }; 