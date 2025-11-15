#!/usr/bin/env node

const WebSocket = require('ws');
const readline = require('readline');

// Configuration
const WS_URL = 'ws://localhost:3002/code/ws/test-prototype-123';

console.log('🔌 Connecting to WebSocket:', WS_URL);

const ws = new WebSocket(WS_URL);
let isProcessing = false;

// Setup readline for interactive input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\n💬 You: '
});

function promptUser() {
  if (!isProcessing) {
    rl.prompt();
  }
}

ws.on('open', () => {
  console.log('✅ Connected to Claude Code WebSocket\n');
  console.log('💡 Type your messages and press Enter to send');
  console.log('💡 Type /interrupt to stop the current query');
  console.log('💡 Type /reset to reset the session');
  console.log('💡 Type /quit to exit\n');

  promptUser();
});

// Handle user input
rl.on('line', (input) => {
  const trimmed = input.trim();

  if (!trimmed) {
    promptUser();
    return;
  }

  // Handle special commands
  if (trimmed === '/quit') {
    console.log('\n👋 Closing connection...');
    ws.close();
    process.exit(0);
  } else if (trimmed === '/interrupt') {
    console.log('\n⚠️  Sending interrupt...');
    ws.send(JSON.stringify({ type: 'interrupt' }));
    isProcessing = false;
  } else if (trimmed === '/reset') {
    console.log('\n🔄 Resetting session...');
    ws.send(JSON.stringify({ type: 'reset_session' }));
  } else {
    // Send query
    console.log('\n📤 Sending query...\n');
    isProcessing = true;
    ws.send(JSON.stringify({
      type: 'query',
      data: {
        prompt: trimmed,
        options: {
          maxTurns: 10,
        }
      }
    }));
  }
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    if (message.type === 'system') {
      if (message.subtype === 'connection') {
        console.log('🔗 Connected - Session:', message.data?.sessionId?.substring(0, 8) + '...');
      } else if (message.subtype === 'init') {
        console.log('🎬 Session initialized:', message.session_id?.substring(0, 8) + '...');
      }
    } else if (message.type === 'agent_message') {
      if (message.data?.type === 'stream_event') {
        const event = message.data.event;
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          // Stream text in real-time
          process.stdout.write(event.delta.text);
        } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          console.log('\n🔧 Tool:', event.content_block.name);
        }
      } else if (message.data?.type === 'result') {
        console.log('\n\n✅ Complete - Turns:', message.data.num_turns, '| Cost: $' + (message.data.total_cost_usd?.toFixed(4) || '0.0000'));
        isProcessing = false;
        promptUser();
      }
    } else if (message.type === 'tool_start') {
      console.log('\n🔧 Tool starting:', message.data?.tool_name);
    } else if (message.type === 'tool_complete') {
      console.log('✓ Tool completed:', message.data?.tool_name);
    } else if (message.type === 'query_complete') {
      console.log('\n✅ Query completed!');
      isProcessing = false;
      promptUser();
    } else if (message.type === 'error') {
      console.error('\n❌ Error:', JSON.stringify(message.error, null, 2));
      isProcessing = false;
      promptUser();
    } else if (message.type === 'interrupted') {
      console.log('\n⚠️  Interrupted:', message.data?.message);
      isProcessing = false;
      promptUser();
    } else if (message.type === 'session_reset') {
      console.log('✅ Session reset');
      promptUser();
    }
  } catch (error) {
    console.error('❌ Failed to parse message:', error.message);
    console.log('Raw data:', data.toString());
  }
});

ws.on('close', (code, reason) => {
  console.log('\n🔌 Connection closed');
  console.log('Code:', code);
  console.log('Reason:', reason.toString() || 'No reason provided');
  rl.close();
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  rl.close();
  process.exit(1);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  if (isProcessing) {
    console.log('\n\n⚠️  Sending interrupt...');
    ws.send(JSON.stringify({ type: 'interrupt' }));
    isProcessing = false;
  } else {
    console.log('\n\n👋 Closing connection...');
    ws.close();
    rl.close();
    process.exit(0);
  }
});
