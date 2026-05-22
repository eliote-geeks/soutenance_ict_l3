# AI Assistant Chatbot Setup Guide

## Overview
The AI Assistant Chatbot is now integrated into NetSentinel. It provides:
- **Online Mode**: Uses Google Gemini API for intelligent responses
- **Offline Mode**: Falls back to local knowledge base when offline
- **Floating UI**: Available via button in bottom-right corner of every page
- **Context-Aware**: Remembers conversation history for better answers

**✨ Bonus**: Gemini API has a **free tier** with generous rate limits - no billing required to get started!

## Setup Instructions

### 1. Get Google Gemini API Key
1. Visit https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the API key
4. Make sure billing is enabled in Google Cloud (Gemini has a free tier with rate limits)

### 2. Configure Environment Variable
Add the API key to your backend `.env` file:

```bash
# .env file in backend directory
GOOGLE_API_KEY=AIza...
```

### 3. Install Dependencies
Update backend dependencies:

```bash
cd backend
pip install -r requirements.txt
```

This installs the `google-generativeai` package needed for Gemini API integration.

### 4. Start the Backend
```bash
python -m uvicorn server:app --reload
```

The chatbot endpoint will be available at: `/api/chatbot/ask`

### 5. Start the Frontend
```bash
cd frontend
npm start
```

The AI Assistant button should appear in the bottom-right corner.

## Features

### Query Examples
Users can ask questions like:
- "What is a port scan?"
- "How does Isolation Forest work?"
- "What is lateral movement?"
- "How does NetSentinel detect threats?"
- "What does a DDoS attack mean?"
- "How do I respond to a security incident?"

### Online/Offline Detection
- The chatbot automatically detects internet connectivity
- Shows "Online" or "Offline Mode" indicator in chat header
- In offline mode, uses the embedded knowledge base
- Indicates when using fallback answers

### Chat Interface
- **Floating Button**: Click to open chat (bottom-right corner)
- **Message History**: Scroll through conversation
- **Timestamps**: See when each message was sent
- **Status Indicators**: Know when AI is thinking or if offline
- **Enter to Send**: Press Enter to send messages

## Architecture

### Frontend: `frontend/src/components/shared/AIAssistant.jsx`
- React component with Tailwind CSS styling
- Real-time message updates
- Online/offline status detection
- Call `/api/chatbot/ask` endpoint

### Backend: `backend/chatbot.py`
- Core logic for Google Gemini API integration
- Offline knowledge base with 10+ Q&A pairs
- Fallback mechanism for failures
- System prompt for consistent responses

### API Endpoint: `backend/server.py`
- POST `/api/chatbot/ask`
- Accepts: message, conversation history, online status
- Returns: response text, fallback indicator

## Customization

### Add More Knowledge Base Answers
Edit `OFFLINE_KNOWLEDGE_BASE` in `backend/chatbot.py`:

```python
OFFLINE_KNOWLEDGE_BASE = {
    "your question here": "your answer here",
    # ... more Q&A pairs
}
```

### Change System Prompt
Modify the `system_prompt` in `get_claude_response()` function in `backend/chatbot.py` to customize AI behavior.

### Adjust UI Styling
The component uses Tailwind CSS classes. Modify `AIAssistant.jsx` to customize:
- Button position/size (currently `bottom-6 right-6`)
- Chat panel width (currently `w-96`)
- Chat panel height (currently `h-[600px]`)
- Color scheme (uses blue gradient)

## Troubleshooting

### "Failed to get response from AI assistant"
- Check GOOGLE_API_KEY is set in `.env`
- Verify Google Gemini API account is enabled
- Check billing is enabled in Google Cloud Console
- Check backend logs for detailed errors

### Chatbot appears but doesn't respond
- Ensure backend is running (`python -m uvicorn server:app --reload`)
- Check browser console for network errors
- Verify CORS is configured (should be in server.py)

### Offline Mode not working
- Check browser Network tab for `/api/chatbot/ask` response
- Ensure conversation history is being passed correctly
- Check that `isOnline` parameter reflects actual connectivity

### Missing Icons
- Ensure `lucide-react` is installed: `npm install lucide-react`
- Icons used: MessageCircle, X, Send, Loader, AlertCircle

## Performance Notes
- Conversation history is limited to last 10 messages for API efficiency
- Gemini API responses are typically fast (1-2 seconds)
- Offline responses are instant
- No database storage for chat history (session-only)
- Free tier has rate limits (~100 requests/minute)

## Security Notes
- Google API key is stored in backend `.env` (never commit this)
- Frontend only sends user messages and conversation context
- No sensitive data (alerts, logs, IPs) are sent to Gemini API
- Chatbot responses are general educational content
- Uses Gemini 1.5 Flash (optimized for efficiency and cost)

## Future Enhancements
Possible improvements for future versions:
- [ ] Persist chat history per user
- [ ] Multi-language support
- [ ] Sentiment analysis for user frustration
- [ ] Context-aware responses using real incident data
- [ ] Document search integration for custom knowledge base
- [ ] Rating system for response quality
- [ ] Export conversation to PDF

## Support
For issues or questions:
1. Check backend logs: `GOOGLE_API_KEY`, network errors
2. Check browser console: JavaScript errors, network calls
3. Verify Gemini API account status and quotas
4. Test offline fallback by disabling internet

## Pricing & Free Tier
- **Free Tier**: Gemini API includes a free tier with:
  - Up to 60 requests per minute
  - 1,500 requests per day
  - No credit card required to start
- **Paid Tier** (if you exceed free tier):
  - $0.075 per 1M input tokens
  - $0.30 per 1M output tokens
  - Very affordable compared to other APIs

---
**Version**: 1.0.0  
**Last Updated**: 2024  
**API**: Google Gemini 1.5 Flash  
**Status**: Production Ready
