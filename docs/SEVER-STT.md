# Gemini Relay API Documentation

This document provides an overview of the Gemini Relay WebSocket server, detailing how frontend clients can interact with it for real-time Speech-to-Text (STT) transcription.

## Overview

The server acts as a relay between a frontend client and the Google Gemini STT service. It handles the connection to Gemini, forwards audio data from the client, and sends back transcription results. The server supports multiple concurrent audio streams, making it suitable for two-way conversations and multi-participant scenarios.

**Key Features:**

- Real-time speech-to-text transcription via Google Gemini
- Support for multiple audio streams ("my" and "their")
- Automatic session management with keepalive and renewal
- Configurable language support
- Comprehensive error handling and status reporting

## Server Setup

Before starting the server, ensure you have the required environment variables configured:

- **GEMINI_API_KEY**: Your Google Gemini API key (required)
- **PORT**: Server port (optional, defaults to 8080)

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
PORT=8080
```

Start the server with:

```bash
npm start
```

## WebSocket Connection

To start, the client needs to establish a WebSocket connection to the server.

- **URL**: `ws://<your-server-ip>:8080`
- **Port**: The default port is `8080`, but it can be configured via the `PORT` environment variable on the server.

### Example: Connecting from JavaScript

```javascript
const socket = new WebSocket("ws://localhost:8080");

socket.onopen = () => {
  console.log("WebSocket connection established.");
  // Initialize the session
  socket.send(
    JSON.stringify({
      type: "OPEN",
      sessionId: "my-session-" + Date.now(),
      language: "en-US",
      streams: ["my", "their"],
    })
  );
};

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log("Received from server:", message);

  switch (message.type) {
    case "CONNECTED":
      console.log("Session ready, can start sending audio");
      break;
    case "PARTIAL":
      console.log(`Transcription [${message.stream}]: ${message.text}`);
      break;
    case "TURN_COMPLETE":
      console.log(`Turn complete for stream: ${message.stream}`);
      break;
    case "ERROR":
      console.error("Server error:", message.message);
      break;
    case "CLOSED":
      console.log("Session closed");
      break;
  }
};

socket.onclose = () => {
  console.log("WebSocket connection closed.");
};

socket.onerror = (error) => {
  console.error("WebSocket error:", error);
};

// Function to send audio data
function sendAudioData(audioBlob, stream = "my") {
  const reader = new FileReader();
  reader.onload = () => {
    const base64Data = reader.result.split(",")[1];
    socket.send(
      JSON.stringify({
        type: "AUDIO",
        stream: stream,
        data: base64Data,
        mimeType: "audio/pcm;rate=24000",
      })
    );
  };
  reader.readAsDataURL(audioBlob);
}

// Function to close session
function closeSession() {
  socket.send(JSON.stringify({ type: "CLOSE" }));
}
```

## Communication Protocol

Communication between the client and server is done through JSON messages.

### Client-to-Server (C2S) Messages

These are messages that the frontend client sends to the server.

#### 1. Opening a Session

Before sending audio data, the client must initialize a session with the server.

**Message Format:**

```json
{
  "type": "OPEN",
  "sessionId": "optional-session-identifier",
  "language": "en-US",
  "streams": ["my", "their"]
}
```

- `type` (string, required): Must be `"OPEN"`.
- `sessionId` (string, optional): A unique identifier for the session.
- `language` (string, optional): Language code for transcription (defaults to `"en-US"`).
- `streams` (array, optional): Array of stream names to initialize (defaults to `["my", "their"]`).

#### 2. Sending Audio Data

To get audio transcribed, the client must send audio chunks in a specific format.

**Message Format:**

```json
{
  "type": "AUDIO",
  "data": "<base64-encoded-audio-data>",
  "stream": "my",
  "mimeType": "audio/pcm;rate=24000"
}
```

- `type` (string, required): Must be `"AUDIO"`.
- `data` (string, required): The audio data, encoded in Base64.
- `stream` (string, required): Must be either `"my"` or `"their"` to specify which audio stream this belongs to.
- `mimeType` (string, required): The MIME type of the audio. **Must be `"audio/pcm;rate=24000"`**.

#### Example: Opening a session and sending audio

```javascript
// First, open the session
function openSession() {
  const message = {
    type: "OPEN",
    sessionId: "my-session-123",
    language: "en-US",
    streams: ["my", "their"],
  };
  socket.send(JSON.stringify(message));
}

function sendAudioChunk(audioData, stream = "my") {
  // Assuming audioData is a Blob or similar, convert to Base64
  const reader = new FileReader();
  reader.onload = function (event) {
    const base64data = event.target.result.split(",")[1];
    const message = {
      type: "AUDIO",
      data: base64data,
      stream: stream,
      mimeType: "audio/pcm;rate=24000",
    };
    socket.send(JSON.stringify(message));
  };
  reader.readAsDataURL(audioData);
}
```

#### 3. Closing the Session

When the client wants to end the session and clean up resources.

**Message Format:**

```json
{
  "type": "CLOSE"
}
```

- `type` (string, required): Must be `"CLOSE"`.

### Server-to-Client (S2C) Messages

These are messages the server sends back to the frontend client.

#### 1. Connection Established

Sent once the server has successfully initialized the session and connected to the Gemini service.

**Message Format:**

```json
{
  "type": "CONNECTED",
  "provider": "gemini"
}
```

#### 2. Partial Transcription

Sent when the server receives partial transcription results from Gemini.

**Message Format:**

```json
{
  "type": "PARTIAL",
  "sessionId": "session-identifier",
  "stream": "my",
  "text": "This is partial transcribed text.",
  "timestamp": 1234567890123
}
```

- `type` (string): `"PARTIAL"`
- `sessionId` (string): The session identifier
- `stream` (string): The stream this transcription belongs to (`"my"` or `"their"`)
- `text` (string): The transcribed text
- `timestamp` (number): Unix timestamp when the transcription was received

#### 3. Turn Complete

Sent when Gemini detects the end of a speech turn.

**Message Format:**

```json
{
  "type": "TURN_COMPLETE",
  "sessionId": "session-identifier",
  "stream": "my"
}
```

#### 4. Usage Information

Sent periodically with usage metadata from Gemini.

**Message Format:**

```json
{
  "type": "USAGE",
  "sessionId": "session-identifier",
  "stream": "my",
  "promptTokens": 150,
  "candidateTokens": 75
}
```

#### 5. Error Message

Sent if an error occurs on the server or in the connection to Gemini.

**Message Format:**

```json
{
  "type": "ERROR",
  "sessionId": "session-identifier",
  "code": "ERROR_CODE",
  "message": "A description of the error."
}
```

Common error codes:

- `BAD_PAYLOAD`: Invalid message format
- `BAD_STATE`: Message sent at wrong time (e.g., AUDIO before OPEN)
- `UPSTREAM_UNAVAILABLE`: Cannot connect to Gemini service
- `UPSTREAM_SEND_FAILED`: Failed to send data to Gemini

#### 6. Connection Closed

Sent when the session is closed.

**Message Format:**

```json
{
  "type": "CLOSED",
  "sessionId": "session-identifier"
}
```

#### 7. Acknowledgment

Sent in response to certain legacy messages for compatibility.

**Message Format:**

```json
{
  "type": "ACK",
  "of": "message-type"
}
```

## Full Workflow Example

1.  Client connects to `ws://localhost:8080`.
2.  Client sends `{"type": "OPEN", "sessionId": "session-123", "language": "en-US", "streams": ["my", "their"]}` to initialize the session.
3.  Server sends `{"type": "CONNECTED", "provider": "gemini"}` once session is ready.
4.  Client starts capturing audio.
5.  Client sends a series of `{"type": "AUDIO", "stream": "my", "data": "...", "mimeType": "audio/pcm;rate=24000"}` messages.
6.  Server forwards audio to Gemini.
7.  As Gemini processes the audio, the server sends `{"type": "PARTIAL", ...}` messages to the client with transcription results.
8.  When Gemini detects end of speech turn, server sends `{"type": "TURN_COMPLETE", ...}`.
9.  Server may send `{"type": "USAGE", ...}` messages with token usage information.
10. Client can send audio for different streams (e.g., `{"type": "AUDIO", "stream": "their", ...}`).
11. When done, client sends `{"type": "CLOSE"}` to clean up the session.
12. Server sends `{"type": "CLOSED", ...}` and closes connections.
13. Client disconnects.
